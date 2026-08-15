// tamtam inspected 2026-05-21
import { getDb, getSetting } from "@/lib/db";
import { runCdaRefreshNow } from "@/lib/cda-scheduler";
import { rateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

export async function POST(request?: NextRequest) {
  const limited = request ? rateLimit(request, "mutation") : null;
  if (limited) return limited;
  const db = getDb();

  if (getSetting(db, "cda_refresh_status") === "running") {
    return Response.json({ error: "refresh already in progress" }, { status: 409 });
  }

  runCdaRefreshNow(db);
  return Response.json({ status: "started" });
}
