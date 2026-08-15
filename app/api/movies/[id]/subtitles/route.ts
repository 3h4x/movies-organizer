import { NextRequest } from "next/server";
import { getDb, Movie } from "@/lib/db";
import { getErrorMessage } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { SUBTITLE_EXTENSIONS, normalizeSubtitle } from "@/lib/subtitles";
import { probeFps } from "@/lib/ffprobe";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const movieId = parseInt(id, 10);

  const movie = db
    .prepare("SELECT * FROM movies WHERE id = ?")
    .get(movieId) as Movie | undefined;
  if (!movie || !movie.file_path) {
    return Response.json({ hasSubtitles: false });
  }

  const filePath = movie.file_path;
  if (!fsSync.existsSync(filePath)) {
    return Response.json({
      hasSubtitles: false,
      error: "Movie file not found",
    });
  }

  const movieDir = path.dirname(filePath);
  const movieFileNameNoExt = path.basename(filePath, path.extname(filePath));

  try {
    const files = await fs.readdir(movieDir);
    const subtitles: { name: string; path: string }[] = [];
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const nameNoExt = path.basename(file, ext);
      if (
        SUBTITLE_EXTENSIONS.includes(ext) &&
        (nameNoExt === movieFileNameNoExt ||
          nameNoExt.startsWith(movieFileNameNoExt))
      ) {
        subtitles.push({
          name: file,
          path: path.join(movieDir, file),
        });
      }
    }

    return Response.json({
      hasSubtitles: subtitles.length > 0,
      subtitles,
    });
  } catch (e) {
    return Response.json({
      hasSubtitles: false,
      error: "Failed to read directory",
    });
  }
}

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
  if (!movie || !movie.file_path) {
    return Response.json(
      { error: "Movie or file path not found" },
      { status: 404 },
    );
  }

  const filePath = movie.file_path;
  if (!fsSync.existsSync(filePath)) {
    return Response.json(
      { error: "Movie file not found on disk" },
      { status: 404 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    const movieDir = path.dirname(filePath);
    const movieFileNameNoExt = path.basename(filePath, path.extname(filePath));
    const originalExt = path.extname(file.name).toLowerCase();

    if (!SUBTITLE_EXTENSIONS.includes(originalExt)) {
      return Response.json(
        {
          error: `Invalid subtitle extension. Supported: ${SUBTITLE_EXTENSIONS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // The upload's extension is only a hint — plenty of files named `.srt` hold
    // MicroDVD, which players silently render as nothing. Trust the bytes instead,
    // converting to SubRip where we can and keeping an honest extension where we can't.
    const fps = await probeFps(filePath);
    const normalized = normalizeSubtitle(buffer, {
      fps,
      fallbackExtension: originalExt,
    });

    // If the movie file was already standardized, movieFileNameNoExt is just Title (no year).
    // The target filename must match the movie filename exactly.
    const newFileName = movieFileNameNoExt + normalized.extension;
    const targetPath = path.join(movieDir, newFileName);

    console.log(
      `[Subtitles] Uploading for movie ${movieId}: ${file.name} -> ${newFileName}`,
    );
    console.log(
      `[Subtitles] Detected ${normalized.format} (${normalized.encoding})` +
        (normalized.converted
          ? `, converted to SubRip at ${fps.toFixed(3)} fps, ${normalized.cueCount} cues`
          : ", stored as-is"),
    );
    console.log(`[Subtitles] Target path: ${targetPath}`);

    await fs.writeFile(targetPath, normalized.content);

    console.log(
      `[Subtitles] Successfully added subtitle for movie ${movieId}: ${newFileName}`,
    );

    return Response.json({
      ok: true,
      message: "Subtitle added successfully",
      fileName: newFileName,
      path: targetPath,
      format: normalized.format,
      encoding: normalized.encoding,
      converted: normalized.converted,
      cueCount: normalized.cueCount,
    });
  } catch (error) {
    console.error("Failed to add subtitle:", error);
    return Response.json(
      { error: getErrorMessage(error) || "Failed to add subtitle" },
      { status: 500 },
    );
  }
}
