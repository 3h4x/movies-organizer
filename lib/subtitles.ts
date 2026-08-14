/**
 * Subtitle format handling.
 *
 * Subtitle files lie about themselves: Polish releases routinely ship MicroDVD
 * or MPL2 payloads under a `.srt` (or `.txt`) name, and players that trust the
 * extension render nothing at all. Everything here sniffs the actual bytes and
 * only then decides what the file is and what it should be called.
 */

export type SubtitleFormat =
  | "srt"
  | "vtt"
  | "microdvd"
  | "mpl2"
  | "tmp"
  | "ass"
  | "unknown";

/** Frame rate assumed for frame-based formats when the video can't be probed. */
export const DEFAULT_FPS = 23.976;

/** Formats we can rewrite into SubRip. `ass` is left alone — it is already a real format. */
const CONVERTIBLE: ReadonlySet<SubtitleFormat> = new Set<SubtitleFormat>([
  "srt",
  "vtt",
  "microdvd",
  "mpl2",
  "tmp",
]);

const MICRODVD_LINE = /^\{(\d+)\}\{(\d*)\}(.*)$/;
const MPL2_LINE = /^\[(\d+)\]\[(\d*)\](.*)$/;
const TMP_LINE = /^(\d{1,2}):([0-5]\d):([0-5]\d):(.*)$/;
const SRT_TIMESTAMP =
  /\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/;
/** MicroDVD styling codes such as {y:i} or {c:$FF00FF} — strip, never render. */
const MICRODVD_CONTROL = /\{[a-zA-Z]:[^}]*\}/g;

/**
 * Decode subtitle bytes to text.
 *
 * Honours a BOM when present, otherwise prefers strict UTF-8 and falls back to
 * windows-1250 — the encoding virtually every Polish subtitle without a BOM uses.
 */
export function decodeSubtitleBuffer(buffer: Buffer): {
  text: string;
  encoding: string;
} {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return { text: buffer.subarray(3).toString("utf8"), encoding: "utf-8-bom" };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return {
      text: decodeWith(buffer.subarray(2), "utf-16le"),
      encoding: "utf-16le",
    };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return {
      text: decodeWith(buffer.subarray(2), "utf-16be"),
      encoding: "utf-16be",
    };
  }

  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(buffer),
      encoding: "utf-8",
    };
  } catch {
    return {
      text: decodeWith(buffer, "windows-1250"),
      encoding: "windows-1250",
    };
  }
}

function decodeWith(buffer: Buffer, encoding: string): string {
  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    // Node built without the matching ICU data — latin1 at least keeps ASCII intact.
    return buffer.toString("latin1");
  }
}

/** Identify a subtitle format from its decoded text. */
export function detectSubtitleFormat(text: string): SubtitleFormat {
  const sample = text.replace(/^﻿/, "");
  if (/^\s*WEBVTT/.test(sample)) return "vtt";
  if (/^\s*\[Script Info\]/im.test(sample) || /^\s*Dialogue:/im.test(sample)) {
    return "ass";
  }

  // A real SubRip file has arrow timestamps; the frame-based formats never do.
  if (SRT_TIMESTAMP.test(sample)) return "srt";

  const lines = sample
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50);

  const hits = { microdvd: 0, mpl2: 0, tmp: 0 };
  for (const line of lines) {
    if (MICRODVD_LINE.test(line)) hits.microdvd++;
    else if (MPL2_LINE.test(line)) hits.mpl2++;
    else if (TMP_LINE.test(line)) hits.tmp++;
  }

  if (hits.microdvd > 0) return "microdvd";
  if (hits.mpl2 > 0) return "mpl2";
  if (hits.tmp > 0) return "tmp";
  return "unknown";
}

/**
 * MicroDVD files often declare their frame rate as the text of the first cue
 * (`{1}{1}23.976`). Returns null when there is no such declaration.
 */
export function readMicroDvdFps(text: string): number | null {
  for (const line of text.split(/\r?\n/)) {
    const match = MICRODVD_LINE.exec(line.trim());
    if (!match) continue;
    const fps = parseFloat(match[3].trim().replace(",", "."));
    return Number.isFinite(fps) && fps >= 10 && fps <= 120 ? fps : null;
  }
  return null;
}

interface Cue {
  start: number;
  end: number;
  text: string;
}

function formatTimestamp(seconds: number): string {
  const totalMs = Math.round(Math.max(0, seconds) * 1000);
  const ms = totalMs % 1000;
  const totalSeconds = (totalMs - ms) / 1000;
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function cleanBody(body: string): string {
  return body
    .split("|")
    .map((part) => part.replace(MICRODVD_CONTROL, "").trim())
    .filter(Boolean)
    .join("\n");
}

function renderSrt(cues: Cue[]): string {
  const body = cues
    .map((cue, index) => {
      const start = formatTimestamp(cue.start);
      const end = formatTimestamp(Math.max(cue.end, cue.start + 0.001));
      return `${index + 1}\n${start} --> ${end}\n${cue.text}\n`;
    })
    .join("\n");
  // CRLF throughout — the form the widest range of hardware players accepts.
  return `${body}\n`.replace(/\r?\n/g, "\r\n");
}

function parseMicroDvd(text: string, fps: number): Cue[] {
  const declared = readMicroDvdFps(text);
  const effectiveFps = declared ?? fps;
  const cues: Cue[] = [];
  let skippedFpsHeader = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const match = MICRODVD_LINE.exec(rawLine.trim());
    if (!match) continue;
    // The fps declaration is metadata, not a subtitle — drop it once.
    if (declared !== null && !skippedFpsHeader) {
      skippedFpsHeader = true;
      continue;
    }
    const startFrame = Number(match[1]);
    const endFrame = Number(match[2] || 0);
    const body = cleanBody(match[3]);
    if (!body) continue;
    const start = startFrame / effectiveFps;
    cues.push({
      start,
      end: endFrame > startFrame ? endFrame / effectiveFps : start + 2,
      text: body,
    });
  }
  return cues;
}

function parseMpl2(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const match = MPL2_LINE.exec(rawLine.trim());
    if (!match) continue;
    // MPL2 counts in deciseconds.
    const start = Number(match[1]) / 10;
    const end = Number(match[2] || 0) / 10;
    const body = cleanBody(match[3]);
    if (!body) continue;
    cues.push({ start, end: end > start ? end : start + 2, text: body });
  }
  return cues;
}

function parseTmp(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const match = TMP_LINE.exec(rawLine.trim());
    if (!match) continue;
    const start =
      Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    const body = cleanBody(match[4]);
    if (!body) continue;
    cues.push({ start, end: start + 2, text: body });
  }
  // TMP carries no end times; run each cue up to the next one, capped at 6s.
  for (let i = 0; i < cues.length - 1; i++) {
    const gap = cues[i + 1].start - cues[i].start;
    if (gap > 0) cues[i].end = cues[i].start + Math.min(gap, 6);
  }
  return cues;
}

/** Parses both SubRip and WebVTT, which differ only in header and decimal separator. */
function parseTimedBlocks(text: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = text.replace(/^﻿/, "").split(/\r?\n\s*\r?\n/);

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((line) => line.trim() !== "");
    const arrowIndex = lines.findIndex((line) => SRT_TIMESTAMP.test(line));
    if (arrowIndex === -1) continue;

    const [rawStart, rawEnd] = lines[arrowIndex].split("-->");
    const body = lines
      .slice(arrowIndex + 1)
      .join("\n")
      .trim();
    if (!body) continue;

    const start = parseTimestamp(rawStart);
    const end = parseTimestamp(rawEnd);
    if (start === null || end === null) continue;
    cues.push({ start, end: end > start ? end : start + 2, text: body });
  }
  return cues;
}

function parseTimestamp(value: string): number | null {
  const match = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/.exec(value);
  if (!match) return null;
  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4].padEnd(3, "0")) / 1000
  );
}

export interface NormalizedSubtitle {
  /** What the uploaded bytes actually were. */
  format: SubtitleFormat;
  /** Character encoding the bytes were decoded from. */
  encoding: string;
  /** Extension the file must be saved under — never a guess from the upload name. */
  extension: string;
  /** Bytes to write to disk (UTF-8 SubRip whenever the format was convertible). */
  content: Buffer;
  /** True when the payload was rewritten into SubRip. */
  converted: boolean;
  /** Number of cues in the result; 0 for formats passed through untouched. */
  cueCount: number;
}

/**
 * Turn arbitrary subtitle bytes into something a player will actually read.
 *
 * Convertible formats become UTF-8 SubRip with a `.srt` extension. ASS/SSA and
 * unrecognised payloads keep their own bytes and get an honest extension rather
 * than being mislabelled as SubRip.
 */
export function normalizeSubtitle(
  buffer: Buffer,
  {
    fps = DEFAULT_FPS,
    fallbackExtension = ".srt",
  }: { fps?: number; fallbackExtension?: string } = {},
): NormalizedSubtitle {
  const { text, encoding } = decodeSubtitleBuffer(buffer);
  const format = detectSubtitleFormat(text);

  const passThrough = (extension: string): NormalizedSubtitle => ({
    format,
    encoding,
    extension,
    content: buffer,
    converted: false,
    cueCount: 0,
  });

  if (!CONVERTIBLE.has(format)) {
    return passThrough(format === "ass" ? ".ass" : fallbackExtension);
  }

  let cues: Cue[];
  switch (format) {
    case "microdvd":
      cues = parseMicroDvd(text, fps);
      break;
    case "mpl2":
      cues = parseMpl2(text);
      break;
    case "tmp":
      cues = parseTmp(text);
      break;
    default:
      cues = parseTimedBlocks(text);
  }

  // Nothing parsed out — keep the original bytes rather than write an empty file.
  if (cues.length === 0) return passThrough(fallbackExtension);

  return {
    format,
    encoding,
    extension: ".srt",
    content: Buffer.from(renderSrt(cues), "utf8"),
    converted: true,
    cueCount: cues.length,
  };
}

/** Extension a subtitle file on disk should carry, based on its actual content. */
export function subtitleExtensionForContent(
  buffer: Buffer,
  currentExtension: string,
): string {
  const { text } = decodeSubtitleBuffer(buffer);
  switch (detectSubtitleFormat(text)) {
    case "srt":
      return ".srt";
    case "vtt":
      return ".vtt";
    case "ass":
      return ".ass";
    case "microdvd":
    case "mpl2":
    case "tmp":
      return ".sub";
    default:
      return currentExtension;
  }
}
