"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownUp, ArrowUpRight, BarChart3, ChevronRight, Cpu, Database, ExternalLink, Info, Moon, RefreshCw, Sun, TrendingUp } from "lucide-react";
import PriceChart from "./price-chart";
import { changeFor, GPUS, historyFor, PRICING_LABELS, RANGES, spread, type GPU, type MarketSnapshot, type PricingType, type Range } from "@/lib/market";

const money = (value: number | undefined | null, digits = 3) => value == null ? "—" : "$" + value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const percent = (value: number | null) => value == null ? "データなし" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const dateTime = (value: string | null | undefined) => value ? new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "未提供";
const trend = (value: number | null) => value == null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative";

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [gpu, setGpu] = useState<GPU>("H100");
  const [type, setType] = useState<PricingType>("on-demand");
  const [range, setRange] = useState<Range>("1M");
  const [tab, setTab] = useState("market");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [descending, setDescending] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const response = await fetch("/api/market", { signal: AbortSignal.timeout(30_000), cache: "no-store" });
      if (!response.ok) throw new Error("API error");
      const data: MarketSnapshot = await response.json();
      if (!Array.isArray(data.markets)) throw new Error("Invalid response");
      setSnapshot(data); setError(null);
    } catch { setError("更新できませんでした。保存済みの表示がある場合はそのまま残しています。時間をおいて再試行してください。"); }
    finally { inFlight.current = false; setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 300_000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { try { const stored = localStorage.getItem("compute-theme"); if (stored === "light" || stored === "dark") setTheme(stored); } catch {} }, []);
  const toggleTheme = () => { const next = theme === "dark" ? "light" : "dark"; setTheme(next); try { localStorage.setItem("compute-theme", next); } catch {} };
  const market = snapshot?.markets.find(m => m.gpu === gpu);
  const meta = GPUS.find(g => g.id === gpu)!;
  const current = market?.current[type];
  const points = useMemo(() => market ? historyFor(market, type, range) : [], [market, type, range]);
  const series = useMemo(() => [{ label: `${gpu} · ${PRICING_LABELS[type]}`, color: theme === "dark" ? "#b3ed86" : "#418227", points }], [gpu, type, points, theme]);
  const providers = [...(market?.providers ?? [])].filter(p => p.pricingType === type).sort((a, b) => (a.priceUsdPerGpuHour - b.priceUsdPerGpuHour) * (descending ? -1 : 1));
  const types = Object.keys(PRICING_LABELS).filter(t => t === type || market?.current[t as PricingType] || market?.history.some(p => p.pricingType === t)) as PricingType[];
  const degraded = market && (market.pricesStatus.state !== "fresh" || market.historyStatus.state !== "fresh");
  const oldObservation = market?.updatedAt && snapshot && Date.parse(snapshot.servedAt) - Date.parse(market.updatedAt) > 36 * 3_600_000;
  const selectGpu = (id: GPU) => { setGpu(id); const next = snapshot?.markets.find(m => m.gpu === id); if (!next?.current[type] && !next?.history.some(p => p.pricingType === type)) setType("on-demand"); };

  return <div className="app" data-theme={theme}>
    <aside className="rail" aria-label="メインナビゲーション">
      <a className="logo" href="#top" aria-label="AI Compute Market ホーム"><Cpu size={25} /></a>
      <a href="#top" className="rail-item selected" title="Market overview" aria-label="Market overview"><BarChart3 size={21} /></a>
      <a href="#providers" className="rail-item" title="Provider prices" aria-label="Provider prices"><Database size={20} /></a>
      <a href="#spreads" className="rail-item" title="Generation spreads" aria-label="Generation spreads"><TrendingUp size={21} /></a>
      <a href="#methodology" className="rail-item rail-bottom" title="データについて" aria-label="データについて"><Info size={20} /></a>
    </aside>
    <div className="shell" id="top">
      <header className="header"><div className="wordmark">COMPUTE<span>MARKET</span><small>BETA</small></div><div className="header-actions"><span className="feed"><i className={error || degraded ? "amber" : snapshot ? "" : "amber"} />{busy ? "取得中" : error || degraded ? "一部データ未取得" : "Daily market data"}</span><button className="icon-button" onClick={toggleTheme} aria-label={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button></div></header>
      <main>
        <div className="breadcrumb">Markets <ChevronRight size={12} /> GPU rentals</div>
        <div className="page-heading"><div><div className="eyebrow">AI INFRASTRUCTURE / MARKET INTELLIGENCE</div><h1>AI Compute Market<span>.</span></h1><p>GPUの価格を、マーケットの視点で。</p></div><button className="refresh" onClick={() => void refresh()} disabled={busy}><RefreshCw size={14} className={busy ? "spin" : ""} />{busy ? "更新中" : "データを更新"}</button></div>

        {error && <div role="alert" className="notice">{error}</div>}
        <div className="gpu-selector" role="group" aria-label="GPU selector">{GPUS.map(g => {
          const item = snapshot?.markets.find(m => m.gpu === g.id);
          const price = item?.current[type]?.price;
          const change = item ? changeFor(item, type, 7) : null;
          return <button key={g.id} className={`gpu-card ${gpu === g.id ? "active" : ""}`} onClick={() => selectGpu(g.id)} aria-pressed={gpu === g.id}>
            <div className="gpu-top"><strong>{g.id}</strong><span>{g.maker}</span></div><div className="gpu-variant">{g.variant}</div><div className="gpu-bottom"><b>{price == null ? (busy && !snapshot ? "…" : "データなし") : money(price, 2)}</b><span className={trend(change)}>{change == null ? "—" : percent(change)}</span></div>
          </button>;
        })}</div>
        <div className="market-nav"><div className="tabs" role="tablist" aria-label="Market view"><button role="tab" aria-selected={tab === "market"} aria-controls="market-panel" id="market-tab" onClick={() => setTab("market")} className={tab === "market" ? "active" : ""}>Market overview</button><button role="tab" aria-selected={tab === "futures"} aria-controls="futures-panel" id="futures-tab" onClick={() => setTab("futures")} className={tab === "futures" ? "active" : ""}>Futures <span>SOON</span></button></div><span className="unit-label">USD / GPU-hour <span>· 7D change in tickers</span></span></div>

        {tab === "futures" ? <section className="panel futures" role="tabpanel" id="futures-panel" aria-labelledby="futures-tab"><Activity size={38} /><div className="eyebrow">CME GPU RENTAL FUTURES</div><h2>The next view of compute.</h2><p>CME GPU rental futures support will be added when market data becomes available.</p><div className="future-tenors">Spot <ChevronRight size={14} /> Front month <ChevronRight size={14} /> 3M <ChevronRight size={14} /> 6M <ChevronRight size={14} /> Forward curve</div><small>価格データは未接続です。架空の先物価格は表示しません。</small></section> : <div role="tabpanel" id="market-panel" aria-labelledby="market-tab">
          <div className="instrument-heading"><div className="instrument-name"><span className="chip-icon"><Cpu size={23} /></span><h2>{meta.maker} {gpu}</h2><span className="badge">{meta.variant}</span></div><div className="pricing-select"><label htmlFor="pricing-type">契約種別</label><select id="pricing-type" value={type} onChange={e => setType(e.target.value as PricingType)}>{types.map(t => <option key={t} value={t}>{PRICING_LABELS[t]}</option>)}</select></div></div>
          {(degraded || oldObservation) && <div className="notice" role="status"><Info size={16} /><div>{degraded ? "APIの一部データを取得できません。取得済みの値はキャッシュとして表示しています。" : "観測日時が36時間以上前のデータです。"}<small>現在価格: {market?.pricesStatus.state} / 履歴: {market?.historyStatus.state} {market?.pricesStatus.error || market?.historyStatus.error}</small></div></div>}
          <section className="overview panel" aria-label="Market overview">
            <div className="headline-price"><div className="eyebrow">DAILY MEDIAN <span className="tiny-dot" /> {PRICING_LABELS[type]}</div><div className={`big-price ${busy && !snapshot ? "loading" : ""}`}>{money(current?.price)}<span>USD / GPU-hour</span></div><div className="price-caption">{current ? <>{current.providerCount ?? "—"} providers · 掲載価格の中央値</> : busy ? "公開データを取得しています" : "この契約種別のデータなし"}</div></div>
            <div className="change-grid">{[1, 7, 30, 90].map(days => { const value = market ? changeFor(market, type, days) : null; return <div key={days} className="change-stat"><span>{days === 1 ? "1 DAY" : `${days} DAYS`}</span><strong className={trend(value)}>{percent(value)}</strong><small>{value == null ? "比較日の観測値なし" : `${days}日前比`}</small></div>; })}</div>
          </section>
          <div className="observation-line"><span>価格対象日 <b>{market?.day ?? "—"}</b></span><span>最終観測 <b>{dateTime(market?.updatedAt)}</b></span><a href="https://priceofcompute.com" target="_blank" rel="noreferrer">Data: Price of Compute <ExternalLink size={11} /></a></div>

          <section className="panel chart-panel" aria-label="Price history"><div className="section-heading"><div><h3>Price history <span>価格推移</span></h3><p><span className="legend-dot" /> {gpu} · {PRICING_LABELS[type]} · 日次中央値</p></div><div className="range-selector" role="group" aria-label="Chart period">{Object.keys(RANGES).map(r => <button key={r} aria-pressed={range === r} className={range === r ? "active" : ""} onClick={() => setRange(r as Range)}>{r}</button>)}</div></div>
            <div className="chart-unit">USD / GPU-hour</div>
            {points.length ? <PriceChart series={series} theme={theme} /> : <div className="empty-chart"><BarChart3 size={32} /><strong>{busy && !snapshot ? "履歴データを取得中…" : "この期間のデータなし"}</strong><p>取得できない観測値は補完しません。</p></div>}
            <div className="chart-footer"><span>{points.length ? `${points[0].timestamp.slice(0, 10)} — ${points.at(-1)!.timestamp.slice(0, 10)} · ${points.length} observations` : "No observations"}</span><span>欠損日は線を接続しません · <i className="archive-dot" /> Archive = 保存ページの掲載価格</span></div>
          </section>

          <div className="lower-grid"><section className="panel provider-panel" id="providers"><div className="section-heading"><div><h3>Provider prices <span>{providers.length}</span></h3><p>{PRICING_LABELS[type]} · 現在のProvider別掲載価格</p></div><button className="sort-button" onClick={() => setDescending(v => !v)}><ArrowDownUp size={14} />{descending ? "高い順" : "安い順"}</button></div>
            <div className="table-scroll"><table><thead><tr><th>Provider / Region</th><th aria-sort={descending ? "descending" : "ascending"}>Price <small>$/GPU-h</small></th><th>Contract</th><th>Availability</th><th>Updated <small>UTC</small></th></tr></thead><tbody>{providers.map((p, i) => <tr key={`${p.provider}-${p.region}-${i}`}><td><span className="provider-avatar">{p.provider.slice(0, 1).toUpperCase()}</span><div><strong>{p.provider}</strong><small>{p.region ?? "Region 未提供"}</small></div></td><td className="table-price">{money(p.priceUsdPerGpuHour, 4)}</td><td><span className="contract-badge">{PRICING_LABELS[p.pricingType]}</span></td><td className="muted">未提供</td><td className="updated-cell">{p.timestamp.slice(0, 10)}<small>{p.timestamp.slice(11, 16)}</small></td></tr>)}</tbody></table>{!providers.length && <div className="table-empty">{busy && !snapshot ? "取得中…" : "Provider別データなし"}</div>}</div>
            <div className="provider-note"><Info size={14} /><span>掲載価格は在庫・約定価格を保証しません。CPU / RAM / Storage、最低契約期間などの条件はAPI未提供のため、同一条件の見積もりではありません。</span></div>
          </section>
          <section className="panel spread-panel" id="spreads"><div className="section-heading"><div><h3>Generation spread</h3><p>世代間の価格プレミアム</p></div><TrendingUp size={19} /></div><div className="spread-type">{PRICING_LABELS[type]} <span>同一日・同一契約種別</span></div>{([["H200", "H100"], ["B200", "H100"], ["B200", "H200"]] as const).map(([a, b]) => {
            const ma = snapshot?.markets.find(m => m.gpu === a), mb = snapshot?.markets.find(m => m.gpu === b);
            const result = spread(ma, mb, type);
            const stale = ma?.pricesStatus.state === "stale" || mb?.pricesStatus.state === "stale";
            return <div className="spread-item" key={`${a}-${b}`}><div className="spread-pair"><strong>{a} <span>/ {b}</span></strong><ArrowUpRight size={15} /></div><div className="spread-value">{percent(result?.premium ?? null)}</div><div className="spread-details"><span>価格差 <b>{result ? `${result.difference >= 0 ? "+" : "−"}${money(Math.abs(result.difference))}` : "—"}</b></span><span>価格比 <b>{result ? `${result.ratio.toFixed(2)}×` : "—"}</b></span></div><small>{result ? `${result.day}${stale ? " · キャッシュ" : ""}` : "同一日の価格データなし"}</small></div>;
          })}<p className="spread-note">価格比は性能比ではありません。Provider構成や付帯条件の違いも含まれます。</p></section></div>

          <section id="methodology" className="methodology"><div className="methodology-title"><Info size={17} /><h3>Know what you’re looking at.</h3><a href="https://priceofcompute.com/methodology" target="_blank" rel="noreferrer">算出方法 <ArrowUpRight size={13} /></a></div><div className="methodology-grid"><p><strong>データソースの中央値</strong>Provider内の中央値を取り、そのProvider間の中央値を採用。独自指数ではありません。Provider構成の変化でも価格は動きます。</p><p><strong>価格条件と単位</strong>データソースがUSD / GPU-hourに正規化。ノード価格はGPU数で除算されますが、各行の換算有無・元GPU数・付帯リソースはAPI未提供です。</p><p><strong>履歴と欠損</strong>2026-08-09より前はアーカイブ由来。変化率は価格対象日の正確に1 / 7 / 30 / 90日前と比較し、該当日がない場合はデータなしとします。</p></div><div className="fetch-times"><span>価格取得: {dateTime(market?.pricesStatus.fetchedAt)}</span><span>履歴取得: {dateTime(market?.historyStatus.fetchedAt)}</span><span>外部APIは1時間キャッシュ</span></div></section>
        </div>}
        <footer><span>COMPUTE MARKET <span className="footer-divider">/</span> Infrastructure in perspective.</span><div><a href="https://priceofcompute.com" target="_blank" rel="noreferrer">Data: Price of Compute <ExternalLink size={11} /></a><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™ · Copyright © 2025 TradingView, Inc.</a></div></footer>
      </main>
    </div>
  </div>;
}
