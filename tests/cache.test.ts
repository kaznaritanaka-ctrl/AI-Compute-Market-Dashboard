import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SnapshotCache, UpstreamError } from "../src/lib/adapters/cache";
const directories: string[] = [];
async function directory() { const path = await mkdtemp(join(tmpdir(), "compute-cache-test-")); directories.push(path); return path; }
afterEach(async () => { await Promise.all(directories.splice(0).map(path => {
  const target = resolve(path);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("compute-cache-test-")) throw new Error("Unsafe test cleanup path");
  return rm(target, { recursive: true, force: true });
})); });
describe("resilient source cache", () => {
  it("deduplicates concurrent requests and persists last success across process instances", async () => {
    const path = await directory();
    const loader = vi.fn(async () => ({ price: 3 }));
    const cache = new SnapshotCache(path, 1000, () => 10_000);
    const results = await Promise.all([cache.get("prices-h100", loader), cache.get("prices-h100", loader)]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(results[0].data).toEqual(results[1].data);
    const restarted = new SnapshotCache(path, 1000, () => 10_100);
    expect((await restarted.get("prices-h100", loader)).status.state).toBe("fresh");
    expect(loader).toHaveBeenCalledTimes(1);
  });
  it("retains stale prices and original fetchedAt on rate limit, respecting Retry-After", async () => {
    let now = 10_000;
    const cache = new SnapshotCache(await directory(), 1000, () => now);
    const initial = await cache.get("prices-h100", async () => 3);
    now = 11_001;
    const failing = vi.fn(async () => { throw new UpstreamError("Rate limited", 5000); });
    const stale = await cache.get("prices-h100", failing);
    expect(stale).toEqual({ data: 3, status: { state: "stale", fetchedAt: initial.status.fetchedAt, error: "Rate limited" } });
    now = 15_000;
    await cache.get("prices-h100", failing);
    expect(failing).toHaveBeenCalledTimes(1);
    now = 16_002;
    expect((await cache.get("prices-h100", async () => 4)).status.state).toBe("fresh");
  });
  it("returns unavailable instead of fabricated values on cold failure", async () => {
    const cache = new SnapshotCache(await directory());
    expect((await cache.get("history-b200", async () => { throw new Error("offline"); })).data).toBeNull();
    expect((await cache.get("history-b200", async () => 0)).status.state).toBe("unavailable");
  });
});
