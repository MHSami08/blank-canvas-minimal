/**
 * Adaptive Parallel Upload Controller.
 *
 * Tracks a rolling window of upload outcomes and continuously searches for the
 * highest *stable* concurrency level, between MIN and MAX. It ramps up slowly
 * while things are healthy and backs off only on repeated instability
 * (rate limits, timeouts, network failures) — never on a single random error.
 */

export type OutcomeKind = "success" | "rate_limit" | "timeout" | "network" | "error";

export type ControllerStats = {
  concurrency: number;
  max: number;
  completed: number;
  failed: number;
  retrying: number;
  avgMs: number;
  successRate: number;
  optimizing: boolean;
};

const WINDOW = 24;

export type AdaptiveOptions = {
  min?: number;
  max?: number;
  start?: number;
  /** Successful uploads needed at a level before considering a ramp-up. */
  successesToRamp?: number;
  /** Minimum time (ms) at a level before ramping up. */
  stableWindowMs?: number;
  /** Ramp-up step size. */
  rampStep?: number;
  /** Back-off step size. */
  backoffStep?: number;
  /** How many bad outcomes inside the rolling window trigger a back-off. */
  errorThreshold?: number;
  /** No back-off / ramp for this long after a change. */
  cooldownMs?: number;
};

export class AdaptiveConcurrencyController {
  readonly min: number;
  readonly max: number;
  private readonly successesToRamp: number;
  private readonly stableWindowMs: number;
  private readonly rampStep: number;
  private readonly backoffStep: number;
  private readonly errorThreshold: number;
  private readonly cooldownMs: number;

  private _concurrency: number;
  private window: OutcomeKind[] = [];
  private durations: number[] = [];
  private successesAtLevel = 0;
  private levelSince = Date.now();
  private lastChange = 0;

  completed = 0;
  failed = 0;
  retrying = 0;
  optimizing = false;

  constructor(opts: AdaptiveOptions = {}) {
    this.min = opts.min ?? 2;
    this.max = opts.max ?? 60;
    this._concurrency = Math.min(this.max, Math.max(this.min, opts.start ?? 15));

    this.successesToRamp = opts.successesToRamp ?? 6;
    this.stableWindowMs = opts.stableWindowMs ?? 2500;
    this.rampStep = opts.rampStep ?? 5;
    this.backoffStep = opts.backoffStep ?? 4;
    this.errorThreshold = opts.errorThreshold ?? 3;
    this.cooldownMs = opts.cooldownMs ?? 4000;
  }

  get concurrency() {
    return this._concurrency;
  }

  private push(kind: OutcomeKind) {
    this.window.push(kind);
    if (this.window.length > WINDOW) this.window.shift();
  }

  private setLevel(next: number) {
    const clamped = Math.min(this.max, Math.max(this.min, next));
    if (clamped === this._concurrency) return;
    this._concurrency = clamped;
    this.successesAtLevel = 0;
    this.levelSince = Date.now();
    this.lastChange = Date.now();
    this.optimizing = true;
    // Fresh slate so an old burst of errors can't immediately re-trigger.
    this.window = [];
  }

  recordSuccess(durationMs: number) {
    this.completed++;
    this.successesAtLevel++;
    this.push("success");
    this.durations.push(durationMs);
    if (this.durations.length > WINDOW) this.durations.shift();
    this.maybeRampUp();
  }

  recordRetry(kind: OutcomeKind) {
    this.retrying++;
    this.push(kind);
    this.maybeBackOff();
  }

  recordFailure(kind: OutcomeKind = "error") {
    this.failed++;
    this.push(kind);
    this.maybeBackOff();
  }

  retryFinished() {
    if (this.retrying > 0) this.retrying--;
  }

  private inCooldown() {
    return Date.now() - this.lastChange < this.cooldownMs;
  }

  private badCount() {
    return this.window.reduce((n, k) => (k === "success" ? n : n + 1), 0);
  }

  private maybeBackOff() {
    if (this.inCooldown()) return;
    const bad = this.badCount();
    const rateLimited = this.window.filter((k) => k === "rate_limit").length;
    // Rate limiting is the strongest signal — react a bit sooner.
    if (bad >= this.errorThreshold || rateLimited >= 2) {
      this.setLevel(this._concurrency - this.backoffStep);
    }
  }

  private maybeRampUp() {
    if (this._concurrency >= this.max) {
      this.optimizing = false;
      return;
    }
    if (this.inCooldown()) return;
    if (this.badCount() > 0) return; // only ramp on a clean window
    if (this.successesAtLevel < this.successesToRamp) return;
    if (Date.now() - this.levelSince < this.stableWindowMs) return;
    this.setLevel(this._concurrency + this.rampStep);
  }

  stats(): ControllerStats {
    const successes = this.window.filter((k) => k === "success").length;
    return {
      concurrency: this._concurrency,
      max: this.max,
      completed: this.completed,
      failed: this.failed,
      retrying: this.retrying,
      avgMs: this.durations.length
        ? Math.round(this.durations.reduce((a, b) => a + b, 0) / this.durations.length)
        : 0,
      successRate: this.window.length ? successes / this.window.length : 1,
      optimizing: this.optimizing && Date.now() - this.lastChange < 3000,
    };
  }
}

/** Classify a thrown upload error into a controller signal. */
export function classifyError(e: unknown): OutcomeKind {
  if (e instanceof DOMException && e.name === "AbortError") return "timeout";
  const status = (e as { status?: number } | null)?.status;
  if (status === 429) return "rate_limit";
  if (status === 403) {
    const msg = (e instanceof Error ? e.message : "").toLowerCase();
    if (msg.includes("rate") || msg.includes("quota") || msg.includes("limit")) return "rate_limit";
    return "error";
  }
  if (status === 408) return "timeout";
  if (e instanceof TypeError) return "network";
  if (typeof navigator !== "undefined" && !navigator.onLine) return "network";
  if (status !== undefined && status >= 500) return "error";
  return "error";
}
