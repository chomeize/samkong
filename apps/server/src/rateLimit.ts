interface Bucket {
  tokens: number;
  updatedAt: number;
}

/** Token bucket keyed by a string (IP, socket id). Old idle buckets are pruned. */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private lastPrune = 0;

  constructor(
    private readonly capacity: number,
    private readonly refillPerMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Takes one token. Returns false when the caller is over the limit. */
  take(key: string): boolean {
    const t = this.now();
    this.prune(t);
    const b = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: t };
    b.tokens = Math.min(this.capacity, b.tokens + ((t - b.updatedAt) / 60_000) * this.refillPerMinute);
    b.updatedAt = t;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
    return true;
  }

  private prune(t: number) {
    if (t - this.lastPrune < 60_000) return;
    this.lastPrune = t;
    const fullAfterMs = (this.capacity / this.refillPerMinute) * 60_000;
    for (const [k, b] of this.buckets) if (t - b.updatedAt > fullAfterMs) this.buckets.delete(k);
  }
}
