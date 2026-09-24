import { z } from "zod";
import type { GPU, GPUMarket, GPUPricePoint, PricingType, ProviderPrice } from "../market";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const date = new Date(s + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === s;
});
const timestamp = z.string().datetime({ offset: true });
const price = z.number().finite().positive();
const pricingTypes: Record<string, PricingType> = {
  on_demand: "on-demand", spot: "spot", reserved: "reserved", community: "community", serverless: "serverless", index: "index",
};
const currentSchema = z.object({
  sku: z.string(), day, updated_at: timestamp,
  prices: z.record(z.string(), z.unknown()), providers: z.array(z.unknown()),
});
const quoteSchema = z.object({ usd_per_gpu_hr: price, providers: z.number().int().nonnegative().optional() });
const providerSchema = z.object({
  provider: z.string().min(1), pricing_type: z.string(), usd_per_gpu_hr: price,
  region: z.string().nullable().optional(), observed_at: timestamp,
});
const historySchema = z.object({ sku: z.string(), series: z.array(z.object({ pricing_type: z.string(), points: z.array(z.unknown()) })) });
const pointSchema = z.object({ day, usd_per_gpu_hr: price });
export const SOURCE = "Price of Compute";
export function normalizeCurrent(raw: unknown, gpu: GPU, sku: string) {
  const data = currentSchema.parse(raw);
  if (data.sku.toLowerCase() !== sku) throw new Error("SKU mismatch");
  const current: GPUMarket["current"] = {};
  for (const [key, value] of Object.entries(data.prices)) {
    const parsed = quoteSchema.safeParse(value), type = pricingTypes[key];
    if (parsed.success && type) current[type] = { price: parsed.data.usd_per_gpu_hr, providerCount: parsed.data.providers ?? null };
  }
  const providers: ProviderPrice[] = [];
  for (const item of data.providers) {
    const parsed = providerSchema.safeParse(item);
    if (!parsed.success) continue;
    const p = parsed.data, type = pricingTypes[p.pricing_type];
    if (!type) continue;
    providers.push({ gpu, provider: p.provider, timestamp: p.observed_at, priceUsdPerGpuHour: p.usd_per_gpu_hr,
      pricingType: type, source: SOURCE, archival: false, region: p.region ?? null,
      availability: null, bundle: null, normalizedFromNode: null, priceKind: "listed" });
  }
  return { current, providers, day: data.day, updatedAt: data.updated_at };
}
export function normalizeHistory(raw: unknown, gpu: GPU, sku: string): GPUPricePoint[] {
  const data = historySchema.parse(raw);
  if (data.sku.toLowerCase() !== sku) throw new Error("SKU mismatch");
  const points = new Map<string, GPUPricePoint>();
  for (const series of data.series) {
    const type = pricingTypes[series.pricing_type];
    if (!type) continue;
    for (const item of series.points) {
      const parsed = pointSchema.safeParse(item);
      if (!parsed.success) continue;
      const p = parsed.data;
      points.set(`${type}:${p.day}`, { gpu, timestamp: p.day + "T00:00:00Z", priceUsdPerGpuHour: p.usd_per_gpu_hr,
        pricingType: type, source: SOURCE,
        // API has no archival field. Boundary is explicitly documented by source methodology.
        archival: p.day < "2026-08-09" });
    }
  }
  return [...points.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
