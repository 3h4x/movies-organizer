import { describe, it, expect } from "vitest";
import {
  decodeSubtitleBuffer,
  detectSubtitleFormat,
  normalizeSubtitle,
  readMicroDvdFps,
  subtitleExtensionForContent,
} from "@/lib/subtitles";

const SRT_SAMPLE = [
  "1",
  "00:00:51,176 --> 00:00:57,224",
  "First line",
  "",
  "2",
  "00:01:12,656 --> 00:01:14,741",
  "Second line",
  "",
].join("\r\n");

const MICRODVD_SAMPLE = [
  "{1227}{1372}CO BEZ TEGO POZOSTAJE?",
  "{1742}{1792}KONIEC",
  "{6904}{7001}Natknalem sie na nia,|grzebiac w starych rupieciach.",
].join("\r\n");

const MPL2_SAMPLE = ["[512][576]Pierwsza kwestia", "[600][660]Druga|kwestia"].join(
  "\r\n",
);

const TMP_SAMPLE = ["0:00:51:Pierwsza kwestia", "0:01:12:Druga kwestia"].join(
  "\r\n",
);

const ASS_SAMPLE = [
  "[Script Info]",
  "ScriptType: v4.00+",
  "",
  "[Events]",
  "Dialogue: 0,0:00:51.17,0:00:57.22,Default,,0,0,0,,Hello",
].join("\r\n");

const VTT_SAMPLE = [
  "WEBVTT",
  "",
  "00:00:51.176 --> 00:00:57.224",
  "First line",
  "",
].join("\n");

describe("detectSubtitleFormat", () => {
  it("detects SubRip", () => {
    expect(detectSubtitleFormat(SRT_SAMPLE)).toBe("srt");
  });

  it("detects MicroDVD even though the file claims to be .srt", () => {
    expect(detectSubtitleFormat(MICRODVD_SAMPLE)).toBe("microdvd");
  });

  it("detects MPL2", () => {
    expect(detectSubtitleFormat(MPL2_SAMPLE)).toBe("mpl2");
  });

  it("detects TMP", () => {
    expect(detectSubtitleFormat(TMP_SAMPLE)).toBe("tmp");
  });

  it("detects ASS/SSA", () => {
    expect(detectSubtitleFormat(ASS_SAMPLE)).toBe("ass");
  });

  it("detects WebVTT", () => {
    expect(detectSubtitleFormat(VTT_SAMPLE)).toBe("vtt");
  });

  it("returns unknown for arbitrary text", () => {
    expect(detectSubtitleFormat("just some notes\nnothing timed here")).toBe(
      "unknown",
    );
  });
});

describe("decodeSubtitleBuffer", () => {
  it("decodes UTF-8", () => {
    const result = decodeSubtitleBuffer(Buffer.from("CÓŻ ŁÓDŹ", "utf8"));
    expect(result.encoding).toBe("utf-8");
    expect(result.text).toBe("CÓŻ ŁÓDŹ");
  });

  it("strips a UTF-8 BOM", () => {
    const buffer = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("1\r\n", "utf8"),
    ]);
    const result = decodeSubtitleBuffer(buffer);
    expect(result.encoding).toBe("utf-8-bom");
    expect(result.text.startsWith("1")).toBe(true);
  });

  it("falls back to windows-1250 for Polish bytes that are not valid UTF-8", () => {
    // "TYTUŁU" in CP1250 — 0xA3 (Ł) is a continuation byte, so strict UTF-8 rejects it.
    const buffer = Buffer.from([0x54, 0x59, 0x54, 0x55, 0xa3, 0x55]);
    const result = decodeSubtitleBuffer(buffer);
    expect(result.encoding).toBe("windows-1250");
    expect(result.text).toBe("TYTUŁU");
  });
});

describe("readMicroDvdFps", () => {
  it("reads an embedded frame rate declaration", () => {
    expect(readMicroDvdFps("{1}{1}23.976\r\n{100}{200}Hello")).toBe(23.976);
  });

  it("returns null when the first cue is real text", () => {
    expect(readMicroDvdFps(MICRODVD_SAMPLE)).toBeNull();
  });
});

describe("normalizeSubtitle", () => {
  it("converts MicroDVD frames to timestamps at the given fps", () => {
    const result = normalizeSubtitle(Buffer.from(MICRODVD_SAMPLE, "utf8"), {
      fps: 23.976,
    });

    expect(result.format).toBe("microdvd");
    expect(result.converted).toBe(true);
    expect(result.extension).toBe(".srt");
    expect(result.cueCount).toBe(3);

    const text = result.content.toString("utf8");
    // 1227 frames / 23.976 fps = 51.176s
    expect(text).toContain("00:00:51,176 --> 00:00:57,224");
    // The `|` separator becomes a real line break.
    expect(text).toContain("Natknalem sie na nia,\r\ngrzebiac w starych rupieciach.");
  });

  it("uses the frame rate declared inside the file over the supplied one", () => {
    const declared = `{1}{1}25\r\n{1250}{1300}Hello`;
    const result = normalizeSubtitle(Buffer.from(declared, "utf8"), { fps: 23.976 });

    // 1250 / 25 = 50s exactly; at 23.976 it would have been 52.135s.
    expect(result.content.toString("utf8")).toContain("00:00:50,000");
    // The fps declaration itself is not emitted as a subtitle.
    expect(result.cueCount).toBe(1);
  });

  it("decodes windows-1250 MicroDVD into UTF-8 SubRip", () => {
    // "{100}{200}TYTUŁU" — 0xA3 is CP1250 "Ł" and invalid as UTF-8.
    const buffer = Buffer.concat([
      Buffer.from("{100}{200}TYTU", "latin1"),
      Buffer.from([0xa3]),
      Buffer.from("U", "latin1"),
    ]);
    const result = normalizeSubtitle(buffer, { fps: 25 });

    expect(result.encoding).toBe("windows-1250");
    expect(result.content.toString("utf8")).toContain("TYTUŁU");
  });

  it("converts MPL2 deciseconds", () => {
    const result = normalizeSubtitle(Buffer.from(MPL2_SAMPLE, "utf8"));

    expect(result.format).toBe("mpl2");
    expect(result.extension).toBe(".srt");
    // [512] = 51.2s
    expect(result.content.toString("utf8")).toContain(
      "00:00:51,200 --> 00:00:57,600",
    );
  });

  it("gives TMP cues an end time from the following cue", () => {
    const result = normalizeSubtitle(Buffer.from(TMP_SAMPLE, "utf8"));

    expect(result.format).toBe("tmp");
    const text = result.content.toString("utf8");
    // Gap to the next cue is 21s, so the 6s cap applies.
    expect(text).toContain("00:00:51,000 --> 00:00:57,000");
  });

  it("converts WebVTT to SubRip with comma decimals", () => {
    const result = normalizeSubtitle(Buffer.from(VTT_SAMPLE, "utf8"));

    expect(result.format).toBe("vtt");
    expect(result.extension).toBe(".srt");
    expect(result.content.toString("utf8")).toContain(
      "00:00:51,176 --> 00:00:57,224",
    );
  });

  it("renumbers SubRip cues and keeps them intact", () => {
    const result = normalizeSubtitle(Buffer.from(SRT_SAMPLE, "utf8"));

    expect(result.format).toBe("srt");
    expect(result.cueCount).toBe(2);
    const text = result.content.toString("utf8");
    expect(text).toContain("1\r\n00:00:51,176 --> 00:00:57,224\r\nFirst line");
    expect(text).toContain("2\r\n00:01:12,656 --> 00:01:14,741\r\nSecond line");
  });

  it("keeps ASS as .ass instead of mislabelling it SubRip", () => {
    const result = normalizeSubtitle(Buffer.from(ASS_SAMPLE, "utf8"));

    expect(result.format).toBe("ass");
    expect(result.extension).toBe(".ass");
    expect(result.converted).toBe(false);
    expect(result.content.toString("utf8")).toBe(ASS_SAMPLE);
  });

  it("passes unrecognised content through under the fallback extension", () => {
    const result = normalizeSubtitle(Buffer.from("not a subtitle", "utf8"), {
      fallbackExtension: ".txt",
    });

    expect(result.format).toBe("unknown");
    expect(result.extension).toBe(".txt");
    expect(result.converted).toBe(false);
  });

  it("does not emit an empty file when a convertible format yields no cues", () => {
    // Arrow timestamps present but every cue body is blank.
    const empty = "1\r\n00:00:01,000 --> 00:00:02,000\r\n\r\n";
    const result = normalizeSubtitle(Buffer.from(empty, "utf8"));

    expect(result.converted).toBe(false);
    expect(result.content.toString("utf8")).toBe(empty);
  });
});

describe("subtitleExtensionForContent", () => {
  it("renames a MicroDVD payload that pretends to be .srt", () => {
    expect(
      subtitleExtensionForContent(Buffer.from(MICRODVD_SAMPLE, "utf8"), ".srt"),
    ).toBe(".sub");
  });

  it("leaves a genuine .srt alone", () => {
    expect(
      subtitleExtensionForContent(Buffer.from(SRT_SAMPLE, "utf8"), ".srt"),
    ).toBe(".srt");
  });

  it("corrects a .sub that actually holds SubRip", () => {
    expect(
      subtitleExtensionForContent(Buffer.from(SRT_SAMPLE, "utf8"), ".sub"),
    ).toBe(".srt");
  });

  it("keeps the current extension for unrecognised content", () => {
    expect(
      subtitleExtensionForContent(Buffer.from("random notes", "utf8"), ".txt"),
    ).toBe(".txt");
  });
});
