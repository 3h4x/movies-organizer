// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/backup", () => ({
  backupDb: vi.fn(),
  getBackupStats: vi.fn(),
}));

import { GET, POST } from "@/app/api/backup/route";
import { backupDb, getBackupStats } from "@/lib/backup";

const mockBackupDb = vi.mocked(backupDb);
const mockGetBackupStats = vi.mocked(getBackupStats);

describe("backup API route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── GET /api/backup ─────────────────────────────────────────────────────────

  describe("GET /api/backup", () => {
    it("returns stats with lastBackup and count", async () => {
      mockGetBackupStats.mockReturnValue({
        lastBackup: "filmpick-2026-04-18-10-00-00.db",
        count: 5,
      });

      const res = await GET();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.lastBackup).toBe("filmpick-2026-04-18-10-00-00.db");
      expect(data.count).toBe(5);
    });

    it("returns null lastBackup and zero count when no backups exist", async () => {
      mockGetBackupStats.mockReturnValue({ lastBackup: null, count: 0 });

      const res = await GET();
      const data = await res.json();

      expect(data.lastBackup).toBeNull();
      expect(data.count).toBe(0);
    });
  });

  // ── POST /api/backup ────────────────────────────────────────────────────────

  describe("POST /api/backup", () => {
    it("returns filename and stats on success", async () => {
      const filename = "filmpick-2026-04-18-10-00-00.db";
      mockBackupDb.mockResolvedValue(filename);
      mockGetBackupStats.mockReturnValue({ lastBackup: filename, count: 3 });

      const res = await POST();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.filename).toBe(filename);
      expect(data.lastBackup).toBe(filename);
      expect(data.count).toBe(3);
    });

    it("calls backupDb with false to skip auto-prune", async () => {
      mockBackupDb.mockResolvedValue("backup.db");
      mockGetBackupStats.mockReturnValue({ lastBackup: "backup.db", count: 1 });

      await POST();

      expect(mockBackupDb).toHaveBeenCalledWith(false);
    });

    it("returns 500 with error message when backup fails", async () => {
      mockBackupDb.mockRejectedValue(new Error("Database not found"));

      const res = await POST();
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe("Database not found");
    });
  });
});
