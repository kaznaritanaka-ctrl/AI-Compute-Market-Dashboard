import "server-only";
import { join } from "node:path";
import { GPUS, type MarketDataAdapter, type MarketSnapshot } from "../market";
import { SnapshotCache, UpstreamError } from "./cache";
import { normalizeCurrent, normalizeHistory, SOURCE } from "./normalize";

const globalCache = globalThis as typeof globalThis & { computeCache?: SnapshotCache };
const cache = globalCache.computeCache ??= new SnapshotCache(process.env.COMPUTE_CACHE_DIR || join(process.cwd(), ".cache", "compute-v1"));
async function request(path: string): Promise<unknown> {
  const response = await fetch(`https://priceofcompute.com/api/v1/${path}`, {
    signal: AbortSignal.timeout(12_000), cache: "no-store", headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    const retryMs = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now())) : 3_600_000;
    throw new UpstreamError(response.status === 429 ? "APIの利用上限に到達しました" : `データソースの応答エラー（${response.status}）`, Number.isFinite(retryMs) ? retryMs : 3_600_000);
  }
  return response.json();
}
export class PriceOfComputeAdapter implements MarketDataAdapter {
  async getSnapshot(): Promise<MarketSnapshot> {
    const markets = await Promise.all(GPUS.map(async gpu => {
      const [prices, history] = await Promise.all([
        cache.get(`prices-${gpu.sku}`, async () => normalizeCurrent(await request(`prices/${gpu.sku}`), gpu.id, gpu.sku)),
        cache.get(`history-${gpu.sku}`, async () => normalizeHistory(await request(`history/${gpu.sku}`), gpu.id, gpu.sku)),
      ]);
      return { gpu: gpu.id, sku: gpu.sku, day: prices.data?.day ?? null, updatedAt: prices.data?.updatedAt ?? null,
        current: prices.data?.current ?? {}, providers: prices.data?.providers ?? [], history: history.data ?? [],
        pricesStatus: prices.status, historyStatus: history.status };
    }));
    return { markets, servedAt: new Date().toISOString(), source: SOURCE, sourceUrl: "https://priceofcompute.com" };
  }
}
