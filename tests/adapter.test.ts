import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("returns six usable empty states when every external endpoint is rate limited", async () => {
  const directory = resolve(".cache", "test-adapter", String(Date.now()));
  await mkdir(directory, { recursive: true });
  vi.stubEnv("COMPUTE_CACHE_DIR", directory);
  const request = vi.fn(async () => new Response('{"error":"rate limited"}', { status: 429, headers: { "Retry-After": "7200" } }));
  vi.stubGlobal("fetch", request);
  const { PriceOfComputeAdapter } = await import("../src/lib/adapters/price-of-compute");
  const adapter = new PriceOfComputeAdapter();
  const snapshot = await adapter.getSnapshot();
  expect(snapshot.markets).toHaveLength(6);
  expect(snapshot.markets.every(m => m.pricesStatus.state === "unavailable" && m.historyStatus.state === "unavailable" && m.history.length === 0 && m.providers.length === 0 && Object.keys(m.current).length === 0)).toBe(true);
  await adapter.getSnapshot();
  expect(request).toHaveBeenCalledTimes(12); // Cooldown prevents a second upstream burst.
});
