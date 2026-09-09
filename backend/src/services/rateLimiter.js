/**
 * RateLimiter
 * ------------
 * Simple sliding-window limiter, keyed by socket id.
 * Allows `maxMessages` within any `windowMs` rolling window.
 *
 * In-memory and per-process. Fine for a single-instance MVP; if this
 * app is ever scaled horizontally, swap this for a shared store
 * (e.g. Redis) keyed by session/IP instead.
 */

class RateLimiter {
  constructor({ maxMessages = 5, windowMs = 10_000 } = {}) {
    this.maxMessages = maxMessages;
    this.windowMs = windowMs;
    // key -> array of timestamps (ms) of recent messages
    this.hits = new Map();
  }

  /**
   * Records an attempt and returns whether it's allowed.
   * @returns {{ allowed: boolean, retryAfterMs: number }}
   */
  attempt(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let timestamps = this.hits.get(key);
    if (!timestamps) {
      timestamps = [];
      this.hits.set(key, timestamps);
    }

    // Drop anything outside the current window.
    while (timestamps.length && timestamps[0] < windowStart) {
      timestamps.shift();
    }

    if (timestamps.length >= this.maxMessages) {
      const retryAfterMs = timestamps[0] + this.windowMs - now;
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
    }

    timestamps.push(now);
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Call on disconnect to avoid leaking memory for long-lived processes. */
  clear(key) {
    this.hits.delete(key);
  }
}

module.exports = { RateLimiter };
