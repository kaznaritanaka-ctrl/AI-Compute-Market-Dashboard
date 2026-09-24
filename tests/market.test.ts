import { describe, expect, it } from "vitest";
import { changeFor, continuousSegments, historyFor, spread, type GPUMarket, type GPUPricePoint } from "../src/lib/market";
import { normalizeCurrent, normalizeHistory } from "../src/lib/adapters/normalize";
// Synthetic test inputs only; these never enter the application or its cache.
const point = (day: string, price: number, type: GPUPricePoint["pricingType"] = "on-demand"): GPUPricePoint => ({ gpu: "H100", timestamp: day + "T00:00:00Z", priceUsdPerGpuHour: price, pricingType: type, source: "test", archival: false });
const base: GPUMarket = { gpu: "H100", sku: "h100-sxm", day: "2026-09-24", updatedAt: "2026-09-24T10:00:00Z", current: { "on-demand": { price: 4, providerCount: 2 } }, history: [point("2026-09-16", 1), point("2026-09-17", 2), point("2026-09-23", 3), point("2026-09-24", 4)], providers: [], pricesStatus: { state: "fresh", fetchedAt: null, error: null }, historyStatus: { state: "fresh", fetchedAt: null, error: null } };
describe("derived market values", () => {
  it("requires the exact comparison date and matching contract type", () => {
    expect(changeFor(base, "on-demand", 7)).toBe(100);
    expect(changeFor(base, "on-demand", 30)).toBeNull();
    expect(changeFor(base, "spot", 7)).toBeNull();
    expect(changeFor({ ...base, history: [point("2026-09-16", 2)] }, "on-demand", 7)).toBeNull();
  });
  it("compares spreads only on the same day and contract type", () => {
    expect(spread(base, { ...base, current: { "on-demand": { price: 2, providerCount: 1 } } }, "on-demand")).toEqual({ difference: 2, ratio: 2, premium: 100, day: "2026-09-24" });
    expect(spread(base, { ...base, day: "2026-09-23" }, "on-demand")).toBeNull();
    expect(spread(base, base, "spot")).toBeNull();
  });
  it("filters UTC calendar ranges and never connects archival or missing days", () => {
    expect(historyFor(base, "on-demand", "7D").map(p => p.timestamp.slice(0, 10))).toEqual(["2026-09-23", "2026-09-24"]);
    expect(continuousSegments(base.history).map(s => s.length)).toEqual([2, 2]);
    expect(continuousSegments([{ ...point("2026-08-08", 3), archival: true }, point("2026-08-09", 3)]).map(s => s.length)).toEqual([1, 1]);
  });
});
describe("API normalization", () => {
  it("keeps pricing types separate, rejects malformed prices and preserves unknown conditions", () => {
    const result = normalizeCurrent({ sku: "H100-SXM", day: "2026-09-24", updated_at: "2026-09-24T10:00:00Z", prices: { on_demand: { usd_per_gpu_hr: 3, providers: 2 }, spot: { usd_per_gpu_hr: 1 }, community: { usd_per_gpu_hr: 2 }, reserved: { usd_per_gpu_hr: null }, mystery: { usd_per_gpu_hr: 9 } }, providers: [{ provider: "example", pricing_type: "on_demand", usd_per_gpu_hr: 3, observed_at: "2026-09-24T09:00:00Z" }, { provider: "bad", pricing_type: "spot", usd_per_gpu_hr: -1, observed_at: "2026-09-24T09:00:00Z" }] }, "H100", "h100-sxm");
    expect(Object.keys(result.current)).toEqual(["on-demand", "spot", "community"]);
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0]).toMatchObject({ priceUsdPerGpuHour: 3, availability: null, bundle: null, normalizedFromNode: null, priceKind: "listed" });
  });
  it("sorts/deduplicates history, rejects missing/zero/string prices and invalid dates", () => {
    const points = normalizeHistory({ sku: "H100-SXM", series: [{ pricing_type: "on_demand", points: [{ day: "2026-08-10", usd_per_gpu_hr: 3 }, { day: "2026-08-10", usd_per_gpu_hr: 3 }, { day: "2023-08-10", usd_per_gpu_hr: 2 }, { day: "2026-08-11", usd_per_gpu_hr: null }, { day: "2026-08-12", usd_per_gpu_hr: 0 }, { day: "2026-08-13", usd_per_gpu_hr: "4" }, { day: "2026-02-30", usd_per_gpu_hr: 5 }] }] }, "H100", "h100-sxm");
    expect(points).toHaveLength(2);
    expect(points[0].archival).toBe(true);
    expect(points[1].archival).toBe(false);
  });
  it("fails closed on changed envelopes or mismatched SKUs", () => {
    expect(() => normalizeHistory({ sku: "B200", series: [] }, "H100", "h100-sxm")).toThrow("SKU mismatch");
    expect(() => normalizeCurrent({ error: "rate limit" }, "H100", "h100-sxm")).toThrow();
  });
});
