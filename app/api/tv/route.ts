// tamtam inspected 2026-05-21
import { getDb, getSetting } from "@/lib/db";
import {
  getMemCache,
  fetchAndCacheEpg,
  invalidateMemCache,
} from "@/lib/epg-fetch";

export async function GET(request: Request) {
  const db = getDb();

  if (getSetting(db, "epg_enabled") === "false") {
    return Response.json({ error: "TV guide is disabled" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const bust = searchParams.get("bust") === "1";

  if (bust) invalidateMemCache();

  const cached = getMemCache();
  if (cached) {
    return Response.json({ ...cached, cached: true });
  }

  try {
    const result = await fetchAndCacheEpg(db);
    return Response.json({ ...result, cached: false });
  } catch (err) {
    const e = err as { message?: string; cause?: { message?: string; code?: string } };
    const cause = e?.cause?.message || e?.cause?.code || "";
    const detail = e?.message ?? "unknown error";
    // Classify the error for a more actionable message
    let hint = "";
    if (detail.includes("fetch failed") || cause.includes("ENOTFOUND") || cause.includes("EAI_AGAIN")) {
      hint = " The EPG server may be unreachable or your server has no internet access.";
    } else if (cause.includes("ECONNREFUSED") || cause.includes("ECONNRESET")) {
      hint = " The EPG server refused the connection.";
    } else if (detail.includes("TLS") || detail.includes("tls") || detail.includes("SSL") || detail.includes("ssl") || detail.includes("packet length")) {
      hint = " TLS/SSL error — the EPG server's certificate may be invalid (HTTP fallback was also attempted).";
    } else if (detail.includes("timeout") || detail.includes("AbortError")) {
      hint = " The EPG server took too long to respond.";
    } else if (detail.includes("returned 4") || detail.includes("returned 5")) {
      hint = " The EPG URL returned an error. Check that the URL is correct.";
    }
    return Response.json(
      { error: `Failed to fetch EPG: ${detail}.${hint}` },
      { status: 502 },
    );
  }
}
