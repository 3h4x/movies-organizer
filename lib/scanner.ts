import { cleanTitle, parseFilename } from "./utils";
import fs from "fs";
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

const IGNORED_DIRECTORY_NAMES = new Set(["Home Movies", "iphotos"]);

export interface ScannedFile {
  filePath: string;
  filename: string;
  parsedTitle: string;
  parsedYear: number | null;
}

export function* scanDirectoryGenerator(
  dirPath: string,
): Generator<ScannedFile> {
  function* walk(dir: string): Generator<ScannedFile> {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (
        entry.name.startsWith(".") ||
        entry.name.startsWith("#") ||
        entry.name.includes("#snapshot")
      )
        continue;
      if (IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (fullPath.includes("#snapshot")) continue;
      if (entry.isDirectory()) {
        yield* walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          const { title, year } = parseFilename(entry.name);
          if (title) {
            yield {
              filePath: fullPath,
              filename: entry.name,
              parsedTitle: title,
              parsedYear: year,
            };
          }
        }
      }
    }
  }

  yield* walk(dirPath);
}

export function scanDirectory(dirPath: string): ScannedFile[] {
  return Array.from(scanDirectoryGenerator(dirPath));
}

export { cleanTitle, parseFilename };
