// tamtam inspected 2026-05-21
import { getDb, getSetting, setSetting } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
  const db = getDb();
  const raw = getSetting(db, "tv_channel_blacklist");
  const list: string[] = raw ? JSON.parse(raw) : [];
  return Response.json(list);
}

export async function PUT(request: Request) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;
  const db = getDb();
  const body = await request.json();

  if (!Array.isArray(body)) {
    return Response.json({ error: "body must be an array" }, { status: 400 });
  }
  if (body.some((item) => typeof item !== "string")) {
    return Response.json({ error: "all items must be strings" }, { status: 400 });
  }

  setSetting(db, "tv_channel_blacklist", JSON.stringify(body as string[]));
  return Response.json({ ok: true });
}
