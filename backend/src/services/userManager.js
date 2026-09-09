/**
 * UserManager
 * ------------
 * Responsible for: assigning/releasing anonymous numeric IDs, tracking
 * currently connected sessions, generating temporary nicknames, and
 * enforcing a cap on simultaneous connections per IP.
 *
 * Entirely in-memory by design — this is session state, not data that
 * should ever be persisted.
 *
 * Two separate identity concepts:
 *  - userId: small, recycled display number (#1, #2, #3…) — purely cosmetic.
 *  - sessionId: globally unique, never recycled — used to determine
 *    message ownership so a new user who happens to get #1 doesn't see
 *    the previous #1's messages as "theirs".
 */

const crypto = require('crypto');

const ADJECTIVES = [
  'Blue', 'Red', 'Green', 'Silent', 'Quick', 'Lazy', 'Wild', 'Calm',
  'Dark', 'Bright', 'Lucky', 'Rusty', 'Shadow', 'Neon', 'Frozen', 'Golden',
];

const NOUNS = [
  'Fox', 'Cat', 'Wolf', 'Hawk', 'Ghost', 'Owl', 'Tiger', 'Raven',
  'Otter', 'Falcon', 'Panda', 'Lynx', 'Crow', 'Bear', 'Viper', 'Sparrow',
];

function generateNickname() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}${noun}`;
}

class UserManager {
  constructor({ maxConnectionsPerIp = 5 } = {}) {
    // socket.id -> { userId, sessionId, nickname, ip, connectedAt, lastActivity }
    this.sessions = new Map();

    // Currently assigned display IDs, so we can recycle the smallest free one.
    this.activeIds = new Set();

    // ip -> count of currently open sockets, to cap simultaneous connections.
    this.ipConnectionCounts = new Map();

    this.maxConnectionsPerIp = maxConnectionsPerIp;
  }

  /** Finds the smallest positive integer not currently in use (for display). */
  _nextAvailableId() {
    let id = 1;
    while (this.activeIds.has(id)) id += 1;
    return id;
  }

  /** Generates a unique session ID that is never recycled. */
  _generateSessionId() {
    return crypto.randomUUID();
  }

  /**
   * Returns true if this IP is allowed to open another connection.
   * Does not mutate state — call registerIp separately once the
   * connection is accepted.
   */
  canConnect(ip) {
    const current = this.ipConnectionCounts.get(ip) || 0;
    return current < this.maxConnectionsPerIp;
  }

  addSession(socketId, ip) {
    const userId = this._nextAvailableId();
    const sessionId = this._generateSessionId();
    const nickname = generateNickname();
    const now = Date.now();

    this.activeIds.add(userId);
    this.sessions.set(socketId, {
      userId,
      sessionId,
      nickname,
      ip,
      connectedAt: now,
      lastActivity: now,
    });

    this.ipConnectionCounts.set(ip, (this.ipConnectionCounts.get(ip) || 0) + 1);

    return { userId, sessionId, nickname };
  }

  removeSession(socketId) {
    const session = this.sessions.get(socketId);
    if (!session) return null;

    this.activeIds.delete(session.userId);
    this.sessions.delete(socketId);

    const ipCount = this.ipConnectionCounts.get(session.ip) || 1;
    if (ipCount <= 1) {
      this.ipConnectionCounts.delete(session.ip);
    } else {
      this.ipConnectionCounts.set(session.ip, ipCount - 1);
    }

    return session;
  }

  getSession(socketId) {
    return this.sessions.get(socketId) || null;
  }

  touchActivity(socketId) {
    const session = this.sessions.get(socketId);
    if (session) session.lastActivity = Date.now();
  }

  getOnlineCount() {
    return this.sessions.size;
  }
}

module.exports = { UserManager, generateNickname };
