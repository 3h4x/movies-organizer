// tamtam inspected 2026-05-21
import { gunzipSync } from "zlib";
import type Database from "better-sqlite3";
import { getSetting, setSetting } from "@/lib/db";
import { DEFAULT_EPG_URL } from "@/lib/epg-presets";

export { DEFAULT_EPG_URL } from "@/lib/epg-presets";

export interface EpgChannel {
  id: string;
  name: string;
  icon: string | null;
}

export interface EpgProgram {
  channel: string;
  title: string;
  start: string;
  stop: string;
  description: string | null;
  category: string | null;
  icon: string | null;
  rating: string | null;
}

export interface EpgCache {
  channels: EpgChannel[];
  programs: EpgProgram[];
  cachedAt: string;
  epgUrl: string;
}

let memCache: EpgCache | null = null;
let memCacheExpiry = 0;

export function getMemCache(): EpgCache | null {
  return Date.now() < memCacheExpiry ? memCache : null;
}

export function setMemCache(data: EpgCache, ttlMs = 30 * 60 * 1000): void {
  memCache = data;
  memCacheExpiry = Date.now() + ttlMs;
}

export function invalidateMemCache(): void {
  memCache = null;
  memCacheExpiry = 0;
}

function parseXmltvDate(s: string): Date {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
  if (!m) return new Date(0);
  const [, y, mo, d, h, min, sec, tz] = m;
  let offset = 0;
  if (tz) {
    const sign = tz[0] === "+" ? 1 : -1;
    offset = sign * (parseInt(tz.slice(1, 3)) * 60 + parseInt(tz.slice(3)));
  }
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +min, +sec) - offset * 60000);
}

const attrRegexCache = new Map<string, RegExp>();
function getAttr(s: string, attr: string): string {
  let re = attrRegexCache.get(attr);
  if (!re) {
    re = new RegExp(`\\b${attr}="([^"]*)"`, "i");
    attrRegexCache.set(attr, re);
  }
  const m = re.exec(s);
  return m ? m[1] : "";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

const SPLIT_RE = /(?=<channel\b|<programme\b)/;
const DISPLAY_NAME_RE = /<display-name[^>]*>([^<]+)/;
const CHANNEL_ICON_RE = /<icon[^>]*\bsrc="([^"]+)"/;
const TITLE_RE = /<title[^>]*>([^<]+)/;
const DESC_RE = /<desc[^>]*>([^<]+)/;
const CATEGORY_RE = /<category[^>]*>([^<]+)/;
const PROGRAMME_ICON_RE = /<icon[^>]*\bsrc="([^"]+)"/;
const STAR_RATING_RE = /<star-rating[^>]*>[\s\S]*?<value>([^<]+)<\/value>/;

function parseXmltv(xml: string, todayStart: Date, todayEnd: Date) {
  const channels: EpgChannel[] = [];
  const programs: EpgProgram[] = [];

  for (const part of xml.split(SPLIT_RE)) {
    if (part.startsWith("<channel")) {
      const id = getAttr(part, "id");
      if (!id) continue;
      const nameMatch = DISPLAY_NAME_RE.exec(part);
      const iconMatch = CHANNEL_ICON_RE.exec(part);
      channels.push({
        id,
        name: nameMatch ? decodeEntities(nameMatch[1].trim()) : id,
        icon: iconMatch ? iconMatch[1] : null,
      });
    } else if (part.startsWith("<programme")) {
      const openTagEnd = part.indexOf(">") + 1;
      if (openTagEnd === 0) continue;
      const openTag = part.slice(0, openTagEnd);
      const startStr = getAttr(openTag, "start");
      const stopStr = getAttr(openTag, "stop");
      const channel = getAttr(openTag, "channel");
      if (!startStr || !stopStr || !channel) continue;
      const start = parseXmltvDate(startStr);
      const stop = parseXmltvDate(stopStr);
      if (stop < todayStart || start > todayEnd) continue;
      const inner = part.slice(openTagEnd);
      const titleMatch = TITLE_RE.exec(inner);
      const descMatch = DESC_RE.exec(inner);
      const catMatch = CATEGORY_RE.exec(inner);
      const iconMatch = PROGRAMME_ICON_RE.exec(inner);
      const starMatch = STAR_RATING_RE.exec(inner);
      programs.push({
        channel,
        title: titleMatch ? decodeEntities(titleMatch[1].trim()) : "Unknown",
        start: start.toISOString(),
        stop: stop.toISOString(),
        description: descMatch ? decodeEntities(descMatch[1].trim()) : null,
        category: catMatch ? catMatch[1].trim() : null,
        icon: iconMatch ? iconMatch[1] : null,
        rating: starMatch ? starMatch[1].trim() : null,
      });
    }
  }

  return { channels, programs };
}

export async function fetchAndCacheEpg(db: Database.Database): Promise<EpgCache> {
  const epgUrl = getSetting(db, "epg_url") || DEFAULT_EPG_URL;

  setSetting(db, "epg_status", "running");

  async function tryFetch(url: string): Promise<Response> {
    return fetch(url, {
      signal: AbortSignal.timeout(90000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FilmPick/1.0)" },
    });
  }

  try {
    let resp: Response;
    let fetchedUrl = epgUrl;
    try {
      resp = await tryFetch(epgUrl);
    } catch (firstErr) {
      // If HTTPS fails with a network/TLS error, retry over HTTP as fallback
      if (epgUrl.startsWith("https://")) {
        const httpUrl = epgUrl.replace(/^https:\/\//, "http://");
        try {
          resp = await tryFetch(httpUrl);
          fetchedUrl = httpUrl;
        } catch {
          throw firstErr; // Re-throw original error if HTTP also fails
        }
      } else {
        throw firstErr;
      }
    }
    if (!resp.ok) throw new Error(`EPG source returned ${resp.status}`);

    const buffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let xml: string;
    if (fetchedUrl.endsWith(".gz") || (bytes[0] === 0x1f && bytes[1] === 0x8b)) {
      xml = gunzipSync(Buffer.from(buffer)).toString("utf-8");
    } else {
      xml = new TextDecoder("utf-8").decode(buffer);
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setDate(todayEnd.getDate() + 1);
    todayEnd.setHours(3, 59, 59, 999);

    const { channels, programs } = parseXmltv(xml, todayStart, todayEnd);
    const result: EpgCache = {
      channels,
      programs,
      cachedAt: new Date().toISOString(),
      epgUrl: fetchedUrl,
    };

    setMemCache(result);
    setSetting(db, "epg_last_refresh", result.cachedAt);
    setSetting(db, "epg_status", "idle");
    return result;
  } catch (err) {
    setSetting(db, "epg_status", "error");
    throw err;
  }
}
