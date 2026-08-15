import { NextRequest, NextResponse } from "next/server";
import { getDb, Movie } from "@/lib/db";
import { getErrorMessage } from "@/lib/utils";
import fs from "fs";
import { stat } from "fs/promises";
import path from "path";

const SRT_TIMESTAMP_RE = /(\d{2}:\d{2}:\d{2}),(\d{3})/g;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: movieId } = await params;

  try {
    const db = getDb();
    const movie = db
      .prepare("SELECT * FROM movies WHERE id = ?")
      .get(movieId) as Movie | undefined;
    if (!movie || !movie.file_path) {
      return new NextResponse("Movie or file path not found", { status: 404 });
    }

    const filePath = movie.file_path;
    const extraFiles = movie.extra_files ? JSON.parse(movie.extra_files) : [];
    const part = parseInt(req.nextUrl.searchParams.get("part") || "0", 10);
    const activeFilePath = part === 0 ? filePath : extraFiles[part - 1];

    if (!activeFilePath) {
      return new NextResponse("File part not found", { status: 404 });
    }

    const subName = req.nextUrl.searchParams.get("sub");

    if (subName) {
      const movieDir = path.dirname(activeFilePath);
      const subPath = path.join(movieDir, subName);
      // Prevent path traversal: resolved subtitle must stay within the movie's directory
      if (!path.resolve(subPath).startsWith(path.resolve(movieDir) + path.sep)) {
        return new NextResponse("Invalid subtitle path", { status: 400 });
      }
      try {
        let subContent = await fs.promises.readFile(subPath, "utf-8");

        // Convert SRT to VTT if needed
        if (subPath.toLowerCase().endsWith(".srt")) {
          subContent =
            "WEBVTT\n\n" +
            subContent.replace(SRT_TIMESTAMP_RE, "$1.$2");
        }

        return new NextResponse(subContent, {
          headers: {
            "Content-Type": "text/vtt",
            "Content-Disposition": "inline",
          },
        });
      } catch (e) {
        return new NextResponse("Subtitle not found", { status: 404 });
      }
    }

    const fileStat = await stat(activeFilePath);
    const range = req.headers.get("range");

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileStat.size - 1;

      if (start >= fileStat.size) {
        return new NextResponse("Requested range not satisfiable", {
          status: 416,
        });
      }

      const chunksize = end - start + 1;
      const file = fs.createReadStream(activeFilePath, { start, end });
      file.on?.("error", (err) => console.error("[Stream API Error]", err));

      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunksize),
        "Content-Type": activeFilePath.toLowerCase().endsWith(".mkv")
          ? "video/x-matroska"
          : "video/mp4",
      };

      return new NextResponse(file as unknown as BodyInit, {
        status: 206,
        headers: head,
      });
    } else {
      const head = {
        "Content-Length": String(fileStat.size),
        "Content-Type": activeFilePath.toLowerCase().endsWith(".mkv")
          ? "video/x-matroska"
          : "video/mp4",
      };
      const file = fs.createReadStream(activeFilePath);
      file.on?.("error", (err) => console.error("[Stream API Error]", err));
      return new NextResponse(file as unknown as BodyInit, {
        status: 200,
        headers: head,
      });
    }
  } catch (error) {
    console.error("[Stream API Error]", error);
    return new NextResponse(getErrorMessage(error), { status: 500 });
  }
}
