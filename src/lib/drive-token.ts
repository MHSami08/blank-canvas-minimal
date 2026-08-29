/**
 * Single-flight Drive access-token manager.
 *
 * Extracted from the uploader so its concurrency behaviour is testable:
 * no matter how many upload workers ask for a token at the same time,
 * at most ONE mint request is in flight, and a failed mint never poisons
 * the manager (the next caller may retry).
 */

export type DriveTokenValue = { accessToken: string; expiresAt: number };

export type DriveTokenManagerOptions = {
  /** Performs the actual network call that mints a token. */
  mint: (force: boolean) => Promise<DriveTokenValue>;
  /** Seconds of head-room before expiry when the cache is considered stale. */
  skewSeconds?: number;
  /** Clock in ms; injectable for tests. */
  now?: () => number;
  /** Optional structured logger. */
  log?: (event: DriveTokenEvent) => void;
};

export type DriveTokenEvent = {
  type: "cache-hit" | "join-inflight" | "mint-start" | "mint-success" | "mint-error";
  waiters: number;
  mints: number;
  force?: boolean;
  error?: string;
};

export type DriveTokenStats = {
  /** Number of actual network mints performed. */
  mints: number;
  /** Callers that joined an already in-flight mint instead of starting a new one. */
  joined: number;
  /** Callers served straight from cache. */
  cacheHits: number;
  /** Failed mints. */
  errors: number;
  /** Peak simultaneous callers waiting on a mint. */
  peakWaiters: number;
};

export function createDriveTokenManager(opts: DriveTokenManagerOptions) {
  const skew = opts.skewSeconds ?? 90;
  const now = opts.now ?? (() => Date.now());
  const log = opts.log;

  let cache: DriveTokenValue | null = null;
  let inFlight: Promise<string> | null = null;
  let waiters = 0;
  const stats: DriveTokenStats = { mints: 0, joined: 0, cacheHits: 0, errors: 0, peakWaiters: 0 };

  const getToken = (force = false): Promise<string> => {
    const seconds = Math.floor(now() / 1000);
    if (!force && cache && cache.expiresAt - skew > seconds) {
      stats.cacheHits++;
      log?.({ type: "cache-hit", waiters, mints: stats.mints });
      return Promise.resolve(cache.accessToken);
    }
    if (inFlight) {
      stats.joined++;
      waiters++;
      stats.peakWaiters = Math.max(stats.peakWaiters, waiters);
      log?.({ type: "join-inflight", waiters, mints: stats.mints, force });
      return inFlight.finally(() => {
        waiters--;
      });
    }

    waiters++;
    stats.peakWaiters = Math.max(stats.peakWaiters, waiters);
    stats.mints++;
    log?.({ type: "mint-start", waiters, mints: stats.mints, force });

    const p = (async () => {
      try {
        const value = await opts.mint(force);
        cache = value;
        log?.({ type: "mint-success", waiters, mints: stats.mints, force });
        return value.accessToken;
      } catch (e) {
        stats.errors++;
        log?.({
          type: "mint-error",
          waiters,
          mints: stats.mints,
          force,
          error: e instanceof Error ? e.message : String(e),
        });
        throw e;
      } finally {
        inFlight = null;
        waiters--;
      }
    })();
    inFlight = p;
    // Avoid unhandled rejection when no one else awaits.
    p.catch(() => {});
    return p;
  };

  return {
    getToken,
    stats: () => ({ ...stats }),
    peek: () => cache,
    reset: () => {
      cache = null;
      inFlight = null;
    },
  };
}
