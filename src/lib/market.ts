export const GPUS = [
  { id: "H100", sku: "h100-sxm", variant: "SXM · 80 GB", maker: "NVIDIA", generation: "Hopper" },
  { id: "H200", sku: "h200-sxm", variant: "SXM · 141 GB", maker: "NVIDIA", generation: "Hopper" },
  { id: "B200", sku: "b200", variant: "Blackwell", maker: "NVIDIA", generation: "Blackwell" },
  { id: "B300", sku: "b300", variant: "Blackwell Ultra", maker: "NVIDIA", generation: "Blackwell Ultra" },
  { id: "A100", sku: "a100-sxm-80gb", variant: "SXM · 80 GB", maker: "NVIDIA", generation: "Ampere" },
  { id: "MI300X", sku: "mi300x", variant: "CDNA 3", maker: "AMD", generation: "CDNA 3" },
] as const;
export type GPU = typeof GPUS[number]["id"];
export type PricingType = "on-demand" | "spot" | "reserved" | "community" | "serverless" | "index";
export const PRICING_LABELS: Record<PricingType, string> = {
  "on-demand": "On-demand", spot: "Spot / Interruptible", reserved: "Reserved / Contract",
  community: "Community", serverless: "Serverless", index: "Index",
};
export type GPUPricePoint = {
  gpu: GPU; timestamp: string; provider?: string; priceUsdPerGpuHour: number;
  pricingType: PricingType; source: string; archival: boolean;
};
export type ProviderPrice = GPUPricePoint & {
  provider: string; region: string | null; availability: string | null;
  // Unknown unless explicitly provided by a future source. Never infer bundles or node counts.
  bundle: string | null; normalizedFromNode: boolean | null; priceKind: "listed" | "traded";
};
export type EndpointStatus = {
  state: "fresh" | "stale" | "unavailable"; fetchedAt: string | null; error: string | null;
};
export type GPUMarket = {
  gpu: GPU; sku: string; day: string | null; updatedAt: string | null;
  current: Partial<Record<PricingType, { price: number; providerCount: number | null }>>;
  history: GPUPricePoint[]; providers: ProviderPrice[];
  pricesStatus: EndpointStatus; historyStatus: EndpointStatus;
};
export type MarketSnapshot = { markets: GPUMarket[]; servedAt: string; source: string; sourceUrl: string };
// The futures adapter can populate this model without changing spot/history adapters.
export type ForwardCurvePoint = {
  gpu: GPU; tenor: "spot" | "front-month" | "3M" | "6M" | "dated";
  contractCode?: string; maturity?: string; timestamp: string;
  priceUsdPerGpuHour: number; source: string; priceKind: "settlement" | "last" | "index";
};
export interface MarketDataAdapter { getSnapshot(): Promise<MarketSnapshot> }
export interface FuturesDataAdapter { getForwardCurve(gpu: GPU): Promise<ForwardCurvePoint[]> }
export const DAY_MS = 86_400_000;
export function changeFor(market: GPUMarket, type: PricingType, days: number): number | null {
  const current = market.current[type]?.price;
  if (current == null || !market.day) return null;
  const target = new Date(Date.parse(market.day + "T00:00:00Z") - days * DAY_MS).toISOString().slice(0, 10);
  const previous = market.history.find(p => p.pricingType === type && p.timestamp.slice(0, 10) === target);
  return previous && previous.priceUsdPerGpuHour > 0 ? (current / previous.priceUsdPerGpuHour - 1) * 100 : null;
}
export function spread(a: GPUMarket | undefined, b: GPUMarket | undefined, type: PricingType) {
  const x = a?.current[type]?.price, y = b?.current[type]?.price;
  // Compare identical observation dates and contract types only.
  if (x == null || y == null || y <= 0 || !a?.day || a.day !== b?.day) return null;
  return { difference: x - y, ratio: x / y, premium: (x / y - 1) * 100, day: a.day };
}
export const RANGES = { "7D": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, MAX: null } as const;
export type Range = keyof typeof RANGES;
export function historyFor(market: GPUMarket, type: PricingType, range: Range) {
  const points = market.history.filter(p => p.pricingType === type);
  const end = market.day ? Date.parse(market.day + "T00:00:00Z") : Date.parse(points.at(-1)?.timestamp ?? "");
  const days = RANGES[range];
  return points.filter(p => Date.parse(p.timestamp) <= end && (days === null || Date.parse(p.timestamp) >= end - (days - 1) * DAY_MS));
}
// Separate consecutive runs so chart libraries cannot draw across missing dates.
export function continuousSegments(points: GPUPricePoint[]) {
  const segments: GPUPricePoint[][] = [];
  for (const point of points) {
    const last = segments.at(-1)?.at(-1);
    if (!last || point.archival || last.archival || Date.parse(point.timestamp) - Date.parse(last.timestamp) !== DAY_MS) segments.push([point]);
    else segments.at(-1)!.push(point);
  }
  return segments;
}
