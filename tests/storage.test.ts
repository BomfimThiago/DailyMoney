import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deleteRawFile, saveRawFile } from "@/lib/ingest/storage";

describe("raw upload storage", () => {
  it("deletes the raw file of a removed upload", async () => {
    const path = await saveRawFile(`test-${Date.now()}`, "extrato teste.csv", Buffer.from("a,b\n1,2\n"));
    expect(existsSync(path)).toBe(true);
    expect(await deleteRawFile(path)).toBe("deleted");
    expect(existsSync(path)).toBe(false);
  });

  it("treats an already-missing file (or no path) as fine", async () => {
    const path = await saveRawFile(`test-${Date.now()}-b`, "x.csv", Buffer.from("x"));
    await deleteRawFile(path);
    expect(await deleteRawFile(path)).toBe("missing");
    expect(await deleteRawFile(null)).toBe("missing");
  });

  it("refuses paths outside storage/uploads", async () => {
    await expect(deleteRawFile("/etc/hosts")).rejects.toThrow(/fora da pasta/);
    await expect(deleteRawFile("storage/uploads/../../package.json")).rejects.toThrow(/fora da pasta/);
  });
});
