import { execFile } from "child_process";
import { promisify } from "util";
import { DEFAULT_FPS } from "@/lib/subtitles";

const execFileAsync = promisify(execFile);

/**
 * Frame rate of a video file, needed to turn frame-based subtitles (MicroDVD)
 * into timestamps. Falls back to the common film rate when ffprobe is missing or
 * the file is unreadable — a slightly wrong rate still beats refusing to serve
 * the subtitle at all.
 */
export async function probeFps(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=r_frame_rate",
        "-of",
        "default=nw=1:nk=1",
        filePath,
      ],
      { timeout: 30000 },
    );
    const [num, den] = stdout.trim().split("/");
    const fps = den ? Number(num) / Number(den) : Number(num);
    return Number.isFinite(fps) && fps >= 10 && fps <= 120 ? fps : DEFAULT_FPS;
  } catch {
    return DEFAULT_FPS;
  }
}
