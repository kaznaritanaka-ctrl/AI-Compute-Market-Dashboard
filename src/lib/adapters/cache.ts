import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EndpointStatus } from "../market";

type Entry = { data?: unknown; fetchedAt?: string; nextAttempt: number; error: string | null };
export type CachedResult<T> = { data: T | null; status: EndpointStatus };
export class UpstreamError extends Error {
  constructor(message: string, public retryMs = 3_600_000) { super(message); }
}
// Per-process single-flight + disk persistence. Deploy multiple replicas with shared external cache.
export class SnapshotCache {
  private memory = new Map<string, Entry>();
  private pending = new Map<string, Promise<CachedResult<unknown>>>();
  constructor(private directory: string, private ttl = 3_600_000, private now = () => Date.now()) {}
  async get<T>(key: string, loader: () => Promise<T>): Promise<CachedResult<T>> {
    if (!/^[a-z0-9-]+$/.test(key)) throw new Error("Invalid cache key");
    const active = this.pending.get(key);
    if (active) return active as Promise<CachedResult<T>>;
    const promise = this.load(key, loader);
    this.pending.set(key, promise);
    try { return await promise; } finally { this.pending.delete(key); }
  }
  private async load<T>(key: string, loader: () => Promise<T>): Promise<CachedResult<T>> {
    let entry = this.memory.get(key);
    if (!entry) {
      try {
        const saved: Entry = JSON.parse(await readFile(join(this.directory, key + ".json"), "utf8"));
        if (typeof saved.nextAttempt === "number" && (!saved.fetchedAt || Number.isFinite(Date.parse(saved.fetchedAt)))) entry = saved;
      } catch { /* A missing/unwritable cache must not take down the app. */ }
    }
    if (!entry || this.now() >= entry.nextAttempt) {
      try {
        const data = await loader();
        entry = { data, fetchedAt: new Date(this.now()).toISOString(), nextAttempt: this.now() + this.ttl, error: null };
      } catch (error) {
        entry = { ...entry, nextAttempt: this.now() + Math.max(this.ttl, error instanceof UpstreamError ? error.retryMs : 0),
          error: error instanceof UpstreamError ? error.message : "応答形式の変更、または接続エラー" };
      }
      try {
        await mkdir(this.directory, { recursive: true });
        const temporary = join(this.directory, `${key}.${process.pid}.tmp`);
        await writeFile(temporary, JSON.stringify(entry));
        await rename(temporary, join(this.directory, key + ".json"));
      } catch { /* Memory cache remains available on read-only/serverless filesystems. */ }
    }
    this.memory.set(key, entry);
    return { data: (entry.data as T) ?? null, status: { state: entry.data == null ? "unavailable" : entry.error ? "stale" : "fresh",
      fetchedAt: entry.fetchedAt ?? null, error: entry.error } };
  }
}
