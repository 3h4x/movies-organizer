// tamtam inspected 2026-05-21
import { NextResponse, type NextRequest } from "next/server";
import { backupDb, getBackupStats } from "@/lib/backup";
import { rateLimit } from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getBackupStats());
}

export async function POST(request?: NextRequest) {
  const limited = request ? rateLimit(request, "mutation") : null;
  if (limited) return limited;
  try {
    const filename = await backupDb(false);
    return NextResponse.json({ filename, ...getBackupStats() });
  } catch (err) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
