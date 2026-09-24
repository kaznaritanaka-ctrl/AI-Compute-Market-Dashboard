import { NextResponse } from "next/server";
import { PriceOfComputeAdapter } from "@/lib/adapters/price-of-compute";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await new PriceOfComputeAdapter().getSnapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "データを取得できませんでした。時間をおいて再試行してください。" }, { status: 503 });
  }
}
