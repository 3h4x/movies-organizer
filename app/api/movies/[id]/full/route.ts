// tamtam inspected 2026-05-21
import { NextRequest } from "next/server";
import { getDb, deleteMovie, Movie } from "@/lib/db";
import { getErrorMessage } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import fs from "fs";
import path from "path";

const SUBTITLE_EXTENSIONS = [".srt", ".ass", ".sub", ".txt", ".vtt"];
const PROTECTED_FOLDER_NAMES = [
  "movies",
  "video",
  "volumes",
  "00_new",
  "downloads",
  "desktop",
  "documents",
  "applications",
  "library",
  "system",
  "users",
];

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;
  const { id } = await params;
  const db = getDb();
  const movieId = parseInt(id, 10);

  const movie = db
    .prepare("SELECT * FROM movies WHERE id = ?")
    .get(movieId) as Movie | undefined;
  if (!movie) {
    return Response.json({ error: "Movie not found" }, { status: 404 });
  }

  // Get library root from settings
  const setting = db
    .prepare("SELECT value FROM settings WHERE key = 'library_path'")
    .get() as { value: string } | undefined;
  const libraryRoot = setting?.value || "/Volumes/video/Movies";

  if (movie.file_path) {
    const filePath = movie.file_path;
    const parentDir = path.dirname(filePath);

    // Safety check: Don't delete the library root!
    const resolvedLibraryRoot = path.resolve(libraryRoot);
    const resolvedParentDir = path.resolve(parentDir);

    if (resolvedParentDir === resolvedLibraryRoot) {
      // The movie is directly in the library root (not in its own folder)
      // We should only delete the file, not the folder.
      console.log(
        `[Delete] Movie file is in library root, only deleting the file: ${filePath}`,
      );
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        // Also delete extra files
        if (movie.extra_files) {
          try {
            const extras = JSON.parse(movie.extra_files);
            for (const extra of extras) {
              if (fs.existsSync(extra)) {
                fs.unlinkSync(extra);
              }
            }
          } catch (e) {
            console.error(`[Delete] Error parsing extra files:`, e);
          }
        }

        // Also try to find and delete subtitles (same name, diff extension)
        const baseExt = path.extname(filePath);
        const baseName = path.basename(filePath, baseExt);
        for (const ext of SUBTITLE_EXTENSIONS) {
          const subPath = path.join(parentDir, baseName + ext);
          if (fs.existsSync(subPath)) {
            fs.unlinkSync(subPath);
          }
        }
      } catch (e) {
        const msg = getErrorMessage(e);
        console.error(`[Delete] Error deleting movie files: ${msg}`);
        return Response.json(
          { error: `Failed to delete movie files: ${msg}` },
          { status: 500 },
        );
      }
    } else if (
      resolvedParentDir.startsWith(resolvedLibraryRoot + path.sep) ||
      resolvedParentDir === resolvedLibraryRoot
    ) {
      // This case handles movies in subdirectories
      // Double check it's NOT just the library root again
      if (resolvedParentDir !== resolvedLibraryRoot) {
        console.log(`[Delete] Deleting folder: ${parentDir}`);
        try {
          if (fs.existsSync(parentDir)) {
            // Safety check against deleting sensitive system/library folders
            const folderName = path.basename(parentDir).toLowerCase();
            if (PROTECTED_FOLDER_NAMES.includes(folderName)) {
              throw new Error(
                `Folder name "${folderName}" is protected and cannot be deleted.`,
              );
            }

            // Try to delete recursively. Sometimes network shares fail with ENOTEMPTY
            // even with recursive: true if there are hidden files or race conditions.
            // Also handle ENOENT if files disappear mid-operation (like .afpDeleted*)
            try {
              if (fs.existsSync(parentDir)) {
                fs.rmSync(parentDir, { recursive: true, force: true });
              }
            } catch (innerError) {
              const innerCode = (innerError as NodeJS.ErrnoException).code;
              if (innerCode === "ENOTEMPTY") {
                console.log(
                  `[Delete] ENOTEMPTY caught for ${parentDir}. Attempting manual content clearing.`,
                );
                // Final attempt: clear contents manually then delete folder
                try {
                  const files = fs.readdirSync(parentDir);
                  for (const file of files) {
                    const curPath = path.join(parentDir, file);
                    try {
                      if (fs.existsSync(curPath)) {
                        const stats = fs.lstatSync(curPath);
                        if (stats.isDirectory()) {
                          fs.rmSync(curPath, { recursive: true, force: true });
                        } else {
                          fs.unlinkSync(curPath);
                        }
                      }
                    } catch (fileErr) {
                      const fileErrCode = (fileErr as NodeJS.ErrnoException).code;
                      // Ignore if file disappeared or is already being handled (common on network shares)
                      if (fileErrCode !== "ENOENT") {
                        console.warn(
                          `[Delete] Warning: Failed to delete item ${curPath} during cleanup: ${getErrorMessage(fileErr)}`,
                        );
                      }
                    }
                  }
                  // Final attempt to remove the directory itself
                  if (fs.existsSync(parentDir)) {
                    try {
                      fs.rmdirSync(parentDir);
                    } catch (finalDirErr) {
                      const finalCode = (finalDirErr as NodeJS.ErrnoException).code;
                      // If it still says not empty, it's likely a persistent network share artifact (.afpDeleted*)
                      // We will log it but CONTINUE to delete the DB record.
                      if (finalCode === "ENOTEMPTY") {
                        console.warn(
                          `[Delete] Folder still not empty after manual cleanup (likely .afpDeleted*): ${parentDir}`,
                        );
                      } else if (finalCode !== "ENOENT") {
                        throw finalDirErr;
                      }
                    }
                  }
                } catch (dirErr) {
                  if ((dirErr as NodeJS.ErrnoException).code !== "ENOENT") throw dirErr;
                }
              } else if (innerCode !== "ENOENT") {
                throw innerError;
              }
            }
          }
        } catch (e) {
          const msg = getErrorMessage(e);
          console.error(`[Delete] Error deleting movie folder: ${msg}`);
          // If the folder is already gone (ENOENT), we can still proceed to delete from DB
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
            return Response.json(
              { error: `Failed to delete movie folder: ${msg}` },
              { status: 500 },
            );
          }
        }
      }
    } else {
      console.warn(
        `[Delete] Parent directory ${parentDir} is not within library root ${libraryRoot}. Skipping file deletion for safety.`,
      );
    }
  }

  // Check if we should keep the DB entry (disk-only deletion)
  const url = new URL(request.url);
  const diskOnly = url.searchParams.get("disk_only") === "1";

  if (diskOnly) {
    // Clear file_path and video_metadata but keep all other data (ratings, metadata, etc.)
    db.prepare(
      "UPDATE movies SET file_path = NULL, extra_files = NULL, video_metadata = NULL WHERE id = ?",
    ).run(movieId);
    return Response.json({
      ok: true,
      message: "Movie folder deleted from disk. Database entry preserved.",
    });
  }

  // Delete from database
  try {
    deleteMovie(db, movieId);
  } catch (dbErr) {
    const msg = getErrorMessage(dbErr);
    console.error(`[Delete] Error deleting movie from database: ${msg}`);
    return Response.json(
      { error: `Failed to delete movie from database: ${msg}` },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    message: "Movie removed from disk and database",
  });
}
