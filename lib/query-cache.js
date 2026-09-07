// lib/query-cache.js — Lightweight query cache for vanilla JS ESM
// Minimal tanstack-query-like cache with staleTime, deduplication, and invalidation.

/**
 * @typedef {Object} CacheEntry
 * @property {*}       data       - Cached result
 * @property {number}  updatedAt  - Timestamp when data was fetched
 * @property {Promise} inflight   - In-flight promise (for dedup), or null
 * @property {string}  status     - 'fresh' | 'stale' | 'fetching' | 'error'
 * @property {Error}   error      - Last error, if any
 */

export class QueryCache {
    /** @param {{ staleTime?: number, gcTime?: number }} [defaults] */
    constructor(defaults = {}) {
        /** @type {Map<string, CacheEntry>} */
        this._entries = new Map();
        this._staleTime = defaults.staleTime ?? 30_000;   // 30 s default
        this._gcTime    = defaults.gcTime    ?? 300_000;   // 5 min default
        this._gcHandle  = null;
    }

    /**
     * Normalise a cache key.  Accepts string or array.
     * Arrays are JSON-stringified so `['route', {src:'a'}]` works.
     * @param {string|Array} key
     * @returns {string}
     */
    static _key(key) {
        return Array.isArray(key) ? JSON.stringify(key) : String(key);
    }

    /**
     * Query the cache.  Returns cached data if fresh, otherwise calls fetcher.
     * Concurrent calls with the same key share the same in-flight promise.
     *
     * @param {string|Array}   key
     * @param {() => Promise}  fetcher
     * @param {{ staleTime?: number, forceRefresh?: boolean }} [opts]
     * @returns {Promise<*>}
     */
    async query(key, fetcher, opts = {}) {
        const k = QueryCache._key(key);
        const staleTime = opts.staleTime ?? this._staleTime;
        const entry = this._entries.get(k);

        // Return cached data if fresh
        if (entry && !opts.forceRefresh) {
            const age = Date.now() - entry.updatedAt;
            if (age < staleTime && entry.status === 'fresh') {
                return entry.data;
            }
            // De-duplicate: if a fetch is already in-flight, piggyback on it
            if (entry.inflight) {
                return entry.inflight;
            }
        }

        // Create or reuse entry
        const current = entry || { data: null, updatedAt: 0, inflight: null, status: 'fetching', error: null };
        if (!entry) this._entries.set(k, current);

        current.status = 'fetching';
        current.inflight = fetcher()
            .then(data => {
                current.data = data;
                current.updatedAt = Date.now();
                current.status = 'fresh';
                current.error = null;
                current.inflight = null;
                return data;
            })
            .catch(err => {
                current.status = 'error';
                current.error = err;
                current.inflight = null;
                throw err;
            });

        return current.inflight;
    }

    /**
     * Get cached data synchronously (may be stale or null).
     * @param {string|Array} key
     * @returns {*|null}
     */
    peek(key) {
        const entry = this._entries.get(QueryCache._key(key));
        return entry ? entry.data : null;
    }

    /**
     * Manually set data in the cache.
     * @param {string|Array} key
     * @param {*} data
     */
    set(key, data) {
        const k = QueryCache._key(key);
        this._entries.set(k, {
            data,
            updatedAt: Date.now(),
            inflight: null,
            status: 'fresh',
            error: null,
        });
    }

    /**
     * Invalidate a key — marks it stale so next query() re-fetches.
     * @param {string|Array} key
     */
    invalidate(key) {
        const entry = this._entries.get(QueryCache._key(key));
        if (entry) {
            entry.status = 'stale';
            entry.updatedAt = 0;
        }
    }

    /**
     * Invalidate all keys whose normalised string starts with a prefix.
     * Useful for invalidating `['chains']`, `['chains', 'morocco-1']`, etc.
     * @param {string|Array} prefix
     */
    invalidatePrefix(prefix) {
        const p = QueryCache._key(prefix);
        for (const [k, entry] of this._entries) {
            if (k.startsWith(p)) {
                entry.status = 'stale';
                entry.updatedAt = 0;
            }
        }
    }

    /** Remove a single key from the cache entirely. */
    remove(key) {
        this._entries.delete(QueryCache._key(key));
    }

    /** Clear the entire cache. */
    clear() {
        this._entries.clear();
    }

    /** Number of entries currently cached. */
    get size() {
        return this._entries.size;
    }

    /**
     * Start periodic garbage collection of entries older than gcTime.
     * @param {number} [interval=60000] — check interval in ms
     */
    startGC(interval = 60_000) {
        this.stopGC();
        this._gcHandle = setInterval(() => {
            const now = Date.now();
            for (const [k, entry] of this._entries) {
                if (!entry.inflight && (now - entry.updatedAt) > this._gcTime) {
                    this._entries.delete(k);
                }
            }
        }, interval);
    }

    /** Stop periodic garbage collection. */
    stopGC() {
        if (this._gcHandle) {
            clearInterval(this._gcHandle);
            this._gcHandle = null;
        }
    }
}
