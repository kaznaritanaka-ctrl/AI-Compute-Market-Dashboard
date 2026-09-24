import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "AI Compute Market | GPU Rental Prices", description: "GPUレンタル価格を継続観測。実データによる価格推移、Provider比較、世代間プレミアム。" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
