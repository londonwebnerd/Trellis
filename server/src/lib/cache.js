/**
 * A very small TTL cache used for social feed lookups, so we hit third-party
 * APIs at most once per TTL no matter how many visitors load the page.
 */
export class TtlCache {
  /**
   * @param {number} ttlMs       how long successful results are kept
   * @param {number} [failTtlMs] how long failures are remembered (0 = not at all)
   */
  constructor(ttlMs, failTtlMs = 0) {
    this.ttlMs = ttlMs;
    this.failTtlMs = failTtlMs;
    this.maxEntries = 500;
    /** @type {Map<string, { value: unknown, expires: number }>} */
    this.entries = new Map();
    /** In-flight promises, so concurrent misses share one upstream request. */
    this.pending = new Map();
  }

  /**
   * Return the cached value for `key`, or compute it with `loader()`.
   * Failed loads are remembered for `failTtlMs` and re-thrown.
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} loader
   * @returns {Promise<T>}
   */
  async get(key, loader) {
    const hit = this.entries.get(key);
    if (hit && hit.expires > Date.now()) {
      if (hit.error) throw hit.error;
      return hit.value;
    }
    if (this.pending.has(key)) return this.pending.get(key);

    const promise = loader()
      .then((value) => {
        this.set(key, { value, expires: Date.now() + this.ttlMs });
        return value;
      })
      .catch((error) => {
        if (this.failTtlMs) this.set(key, { error, expires: Date.now() + this.failTtlMs });
        throw error;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }

  /** Store an entry, evicting the oldest ones beyond maxEntries. */
  set(key, entry) {
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
  }

  clear() {
    this.entries.clear();
  }
}
