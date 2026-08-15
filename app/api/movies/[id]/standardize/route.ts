import { NextRequest } from "next/server";
import { getDb, Movie } from "@/lib/db";
import { parseFilename, getErrorMessage } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { subtitleExtensionForContent } from "@/lib/subtitles";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mkv",
  ".avi",
  ".wmv",
  ".m4v",
  ".mov",
  ".flv",
  ".webm",
]);

const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/g;

const SUBTITLE_EXTENSIONS = new Set([".srt", ".sub", ".txt", ".ass"]);

export async function POST(
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

  // Merge helper: Merge metadata from source to target movie if target is missing it
  const mergeMovies = (sourceId: number, targetId: number) => {
    const s = db
      .prepare("SELECT * FROM movies WHERE id = ?")
      .get(sourceId) as Movie | undefined;
    const t = db
      .prepare("SELECT * FROM movies WHERE id = ?")
      .get(targetId) as Movie | undefined;
    if (!s || !t) return;

    const updates: Partial<Movie> = {};

    // 1. user_rating: take max
    if (s.user_rating || t.user_rating) {
      updates.user_rating =
        Math.max(Number(s.user_rating || 0), Number(t.user_rating || 0)) ||
        null;
    }

    // 2. rating: take max
    if (s.rating || t.rating) {
      updates.rating =
        Math.max(Number(s.rating || 0), Number(t.rating || 0)) || null;
    }

    // 3. description: take longer
    if (s.description || t.description) {
      const sDesc = s.description || "";
      const tDesc = t.description || "";
      updates.description = sDesc.length > tDesc.length ? sDesc : tDesc;
    }

    // 4. Simple non-null fields
    const fields = [
      "tmdb_id",
      "imdb_id",
      "director",
      "poster_url",
      "pl_title",
      "rated_at",
      "file_path",
      "source",
      "filmweb_id",
      "filmweb_url",
      "cda_url",
      "extra_files",
    ];
    for (const f of fields) {
      const key = f as keyof Movie;
      if (!t[key] && s[key]) {
        (updates as Record<keyof Movie, Movie[keyof Movie]>)[key] = s[key];
      }
    }

    // 5. Combine genres
    if (s.genre && t.genre) {
      const sGenres = s.genre.split(",").map((g: string) => g.trim());
      const tGenres = t.genre.split(",").map((g: string) => g.trim());
      const allGenres = Array.from(new Set([...sGenres, ...tGenres])).filter(
        Boolean,
      );
      updates.genre = allGenres.join(", ");
    } else if (s.genre && !t.genre) {
      updates.genre = s.genre;
    }

    const updateKeys = Object.keys(updates);
    const updateParams = Object.values(updates);

    if (updateKeys.length > 0) {
      const setClause = updateKeys.map((k) => `${k} = ?`).join(", ");
      db.prepare(`UPDATE movies SET ${setClause} WHERE id = ?`).run(
        ...updateParams,
        targetId,
      );
    }

    // Always delete the source after merging into target
    db.prepare("DELETE FROM movies WHERE id = ?").run(sourceId);
  };

  if (!movie.file_path) {
    return Response.json(
      { error: "No file path associated with this movie" },
      { status: 400 },
    );
  }

  const oldPath = movie.file_path;
  const oldTitle = movie.title;

  // Clean the title from the DB if it's noisy
  const { title: cleanedTitle, year: cleanedYear } = parseFilename(movie.title);
  const finalTitle = cleanedTitle || movie.title;
  const finalYear = movie.year || cleanedYear;

  // Standard format: Movie Name [Year]/Movie Name.ext
  const setting = db
    .prepare("SELECT value FROM settings WHERE key = 'library_path'")
    .get() as { value: string } | undefined;

  // Root can be library_path setting OR current parent's parent (assuming it was Movie/Folder/File)
  const libraryRoot = setting?.value || path.dirname(path.dirname(oldPath));

  const ext = path.extname(oldPath);
  const safeTitle = finalTitle.replace(UNSAFE_FILENAME_CHARS, " ");
  const movieYear = finalYear || "";
  const folderName = movieYear ? `${safeTitle} [${movieYear}]` : safeTitle;

  // Detection for split-CD files (CD1, CD2, etc.)
  const movieDir = path.dirname(oldPath);
  const fileNameNoExt = path.basename(oldPath, ext);
  const lowerName = fileNameNoExt.toLowerCase();
  const isCD1 = lowerName.includes("cd1") || /[\s._-]a$/i.test(fileNameNoExt);
  const isCD2 = lowerName.includes("cd2") || /[\s._-]b$/i.test(fileNameNoExt);

  const targetFileName = isCD1
    ? `${safeTitle} CD1${ext}`
    : isCD2
      ? `${safeTitle} CD2${ext}`
      : `${safeTitle}${ext}`;

  const targetDir = path.join(libraryRoot, folderName);
  const newPath = path.join(targetDir, targetFileName);

  console.log(`Standardizing movie: id=${movieId}, title="${movie.title}"`);
  console.log(`- libraryRoot: ${libraryRoot}`);
  console.log(`- oldPath: ${oldPath}`);
  console.log(`- newPath: ${newPath}`);

  // Use fsSync for quick existence checks
  if (!fsSync.existsSync(oldPath)) {
    // RECOVERY: If the file is missing from oldPath, check if it ALREADY exists at newPath
    // This happens if the move succeeded in a previous attempt but the DB update failed.
    if (fsSync.existsSync(newPath)) {
      console.log(
        `Recovery: Movie file already found at target destination: ${newPath}`,
      );

      // Conflict check: if another movie already has this title + year
      if (finalTitle !== movie.title || finalYear !== movie.year || true) {
        // Always check for conflicts with the final title
        const conflict = db
          .prepare(
            "SELECT id, file_path FROM movies WHERE title = ? AND year = ? AND id != ? AND type = 'movie'",
          )
          .get(finalTitle, finalYear, movieId) as { id: number; file_path: string | null } | undefined;
        if (conflict) {
          console.log(
            `- Merge conflict detected during recovery (ID=${conflict.id})`,
          );

          // If the conflict has the SAME path, we just merge and delete the current one
          if (conflict.file_path === newPath) {
            mergeMovies(movieId, conflict.id);
            return Response.json({
              ok: true,
              message: "Movies merged (target already had path)",
              newPath,
              newTitle: finalTitle,
              mergedId: conflict.id,
            });
          }

          // Otherwise, we merge the conflict into the current one and update the current one's path
          mergeMovies(conflict.id, movieId);
          db.prepare(
            "UPDATE movies SET file_path = ?, title = ?, year = ?, video_metadata = NULL WHERE id = ?",
          ).run(newPath, finalTitle, finalYear, movieId);
          return Response.json({
            ok: true,
            message: "Movies merged and DB updated",
            newPath,
            newTitle: finalTitle,
            newYear: finalYear,
          });
        }
      }

      db.prepare(
        "UPDATE movies SET file_path = ?, title = ?, year = ?, video_metadata = NULL WHERE id = ?",
      ).run(newPath, finalTitle, finalYear, movieId);
      return Response.json({
        ok: true,
        message: "DB updated (file was already moved)",
        newPath,
        newTitle: finalTitle,
        newYear: finalYear,
      });
    }

    // If the file is missing, we check for a 'delete_missing' query param to cleanup DB
    const deleteMissing =
      request.nextUrl.searchParams.get("delete_missing") === "true";
    if (deleteMissing) {
      db.prepare("DELETE FROM movies WHERE id = ?").run(movieId);
      return Response.json({
        ok: true,
        message: "Entry removed from database (file missing)",
      });
    }

    return Response.json(
      {
        error: `File not found: ${oldPath}`,
        code: "FILE_NOT_FOUND",
        details:
          "The file is missing or unmounted. You can remove this entry from your library.",
      },
      { status: 404 },
    );
  }

  // Check for unique constraint violation (title + year) before proceeding
  const conflict = db
    .prepare(
      "SELECT id, file_path FROM movies WHERE title = ? AND year = ? AND id != ? AND type = 'movie'",
    )
    .get(finalTitle, finalYear, movieId) as { id: number; file_path: string | null } | undefined;
  if (conflict) {
    console.log(
      `- Merge conflict detected during standardization (ID=${conflict.id})`,
    );
    // If the conflicting record has NO path, just delete it (it's a placeholder)
    if (!conflict.file_path) {
      db.prepare("DELETE FROM movies WHERE id = ?").run(conflict.id);
    } else {
      // If it has a path, we should check if the file exists
      if (!fsSync.existsSync(conflict.file_path)) {
        console.log(
          `- Conflicting file not found, removing placeholder: ${conflict.file_path}`,
        );
        db.prepare("DELETE FROM movies WHERE id = ?").run(conflict.id);
      } else {
        // Both exist on disk! We will merge metadata and use the EXISTING record as the winner
        // since it already has a correct path (presumably standardized or at least valid).
        // Actually, the current movie is being moved to a standard path.
        // Let's merge metadata and proceed with the current move.
        // To avoid UNIQUE constraint, we delete the conflict (after merging from it if needed)
        mergeMovies(conflict.id, movieId);
      }
    }
  }

  // Normalize Unicode (macOS uses NFD for filenames, DB may store NFC)
  const normOld = oldPath.normalize("NFC");
  const normNew = newPath.normalize("NFC");

  // If path is already standard but title is noisy, we still want to update the DB
  if (
    normOld === normNew &&
    oldTitle === finalTitle &&
    movie.year === finalYear
  ) {
    return Response.json({
      ok: true,
      message: "Path and title are already standard",
      path: newPath,
    });
  }

  try {
    // 1. Create target directory
    if (!fsSync.existsSync(targetDir)) {
      console.log(`- Creating target directory: ${targetDir}`);
      await fs.mkdir(targetDir, { recursive: true });
    }

    // 2. Check for collision (use normalized comparison to handle macOS NFD vs NFC)
    if (normOld !== normNew && fsSync.existsSync(newPath)) {
      console.warn(`- Collision: Target file already exists: ${newPath}`);
      return Response.json(
        {
          error: `Target file already exists: ${newPath}`,
          details:
            "A file already exists at the standardized location. This might be a duplicate.",
        },
        { status: 409 },
      );
    }

    // 3. Move movie file
    if (normOld !== normNew) {
      console.log(`- Moving file: ${oldPath} -> ${newPath}`);
      await fs.rename(oldPath, newPath);
    }

    // 4. Group multi-part files (CD2, etc.) if current is CD1 or vice versa
    let updatedExtraFiles = movie.extra_files;
    if (oldPath !== newPath && (isCD1 || isCD2)) {
      const oldDir = path.dirname(oldPath);
      const filesInOldDir = await fs.readdir(oldDir);
      const siblingCD = isCD1 ? "cd2" : "cd1";
      const siblingFile = filesInOldDir.find(
        (f) =>
          f.toLowerCase().includes(siblingCD) &&
          VIDEO_EXTENSIONS.has(path.extname(f).toLowerCase()),
      );

      if (siblingFile) {
        const siblingExt = path.extname(siblingFile);
        const newSiblingName = `${safeTitle} ${siblingCD.toUpperCase()}${siblingExt}`;
        const newSiblingPath = path.join(targetDir, newSiblingName);
        console.log(
          `- Moving sibling part: ${siblingFile} -> ${newSiblingPath}`,
        );
        await fs.rename(path.join(oldDir, siblingFile), newSiblingPath);

        // Update extra_files JSON
        const extra = movie.extra_files ? JSON.parse(movie.extra_files) : [];
        if (!extra.includes(newSiblingPath)) {
          extra.push(newSiblingPath);
        }
        updatedExtraFiles = JSON.stringify(extra);
      }
    }

    // 5. Move associated subtitles
    if (normOld !== normNew) {
      console.log(`- Scanning for subtitles in: ${path.dirname(oldPath)}`);
      const oldDir = path.dirname(oldPath);
      const oldFileNameNoExt = path.basename(oldPath, ext);
      const filesInOldDir = await fs.readdir(oldDir);

      for (const file of filesInOldDir) {
        const fileExt = path.extname(file).toLowerCase();
        const fileNameNoExt = path.basename(file, path.extname(file));

        // If subtitle matches the old movie filename or starts with it
        if (
          SUBTITLE_EXTENSIONS.has(fileExt) &&
          (fileNameNoExt === oldFileNameNoExt ||
            fileNameNoExt.startsWith(oldFileNameNoExt))
        ) {
          const oldSubPath = path.join(oldDir, file);
          // Name the file after what it actually contains. Forcing `.srt` here used
          // to relabel MicroDVD payloads as SubRip, which players render as nothing.
          let targetSubExt = fileExt;
          try {
            targetSubExt = subtitleExtensionForContent(
              await fs.readFile(oldSubPath),
              fileExt,
            );
          } catch (e) {
            console.warn(`- Could not sniff subtitle format for ${file}:`, e);
          }
          const newSubName =
            fileNameNoExt.replace(oldFileNameNoExt, finalTitle) + targetSubExt;
          const newSubPath = path.join(targetDir, newSubName);
          console.log(`- Moving subtitle: ${file} -> ${newSubName}`);
          await fs.rename(oldSubPath, newSubPath);
        }
      }
    }

    // 6. Update DB
    console.log(`- Updating DB record: id=${movieId}`);
    db.prepare(
      "UPDATE movies SET file_path = ?, title = ?, year = ?, extra_files = ?, video_metadata = NULL WHERE id = ?",
    ).run(newPath, finalTitle, finalYear, updatedExtraFiles, movieId);

    // 6. Delete old directory — movie and subtitles have been moved, remaining contents are trash
    try {
      if (normOld !== normNew) {
        const oldDir = path.dirname(oldPath);
        if (oldDir !== libraryRoot && oldDir !== targetDir) {
          // Safety: skip if remaining contents exceed 10 MB (something valuable may be there)
          const getDirSize = async (dir: string): Promise<number> => {
            let total = 0;
            let entries;
            try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return 0; }
            for (const e of entries) {
              const full = path.join(dir, e.name);
              if (e.isDirectory()) {
                total += await getDirSize(full);
              } else {
                try { total += (await fs.stat(full)).size; } catch {}
              }
            }
            return total;
          };
          const remainingBytes = await getDirSize(oldDir);
          if (remainingBytes > 10 * 1024 * 1024) {
            console.warn(`- Skipping delete: remaining contents are ${(remainingBytes / 1024 / 1024).toFixed(1)} MB > 10 MB: ${oldDir}`);
          } else {
            console.log(`- Deleting old directory (${(remainingBytes / 1024).toFixed(0)} KB remaining): ${oldDir}`);
            await fs.rm(oldDir, { recursive: true, force: true });
          }
        }
      }
    } catch (e) {
      console.warn(
        `- Failed to delete old directory: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    console.log(`Successfully standardized movie: id=${movieId}`);
    return Response.json({ ok: true, newPath, newTitle: finalTitle });
  } catch (error) {
    console.error("Standardization failed:", error);
    return Response.json(
      { error: getErrorMessage(error) || "Failed to standardize path" },
      { status: 500 },
    );
  }
}
