const mongoose = require('mongoose');
const Message = require('../models/Message');

/**
 * MessageManager
 * ---------------
 * Owns message persistence and the retention policy.
 *
 * - Global room retains up to 1000 messages (configurable via maxStoredMessages).
 * - Custom rooms have no retention cap (auto-deleted when the room is cleaned up).
 * - Initial load serves 50 messages; older messages are fetched via cursor-based pagination.
 *
 * Primary path: MongoDB (durable, shared across server restarts).
 * Fallback path: an in-memory circular buffer, used automatically if
 * Mongo is unreachable, so the chat keeps working in a degraded mode
 * instead of crashing or blocking messages.
 *
 * When the DB reconnects, any messages saved to memory during the outage
 * are flushed back to MongoDB so nothing is lost.
 */
class MessageManager {
  constructor({ maxStoredMessages = 1000, initialLoadLimit = 50 } = {}) {
    this.maxStoredMessages = maxStoredMessages;
    this.initialLoadLimit = initialLoadLimit;

    // Fallback in-memory store: plain array used as a bounded queue.
    // Keyed by roomId for multi-room support.
    this.memoryStores = new Map(); // roomId -> []
    this._flushing = false;

    // Listen for DB reconnections so we can flush in-memory messages
    mongoose.connection.on('connected', () => {
      this._flushMemoryToDb();
    });
  }

  _dbAvailable() {
    return mongoose.connection.readyState === 1; // 1 = connected
  }

  _getMemoryStore(roomId) {
    if (!this.memoryStores.has(roomId)) {
      this.memoryStores.set(roomId, []);
    }
    return this.memoryStores.get(roomId);
  }

  /**
   * Persists a message and enforces the retention cap (global room only).
   * Returns the stored message in a plain, client-safe shape.
   */
  async saveMessage({ roomId = 'global', userId, sessionId, nickname, message }) {
    const doc = {
      roomId,
      userId,
      sessionId,
      nickname,
      message,
      createdAt: new Date(),
    };

    if (this._dbAvailable()) {
      try {
        const created = await Message.create(doc);
        // Only trim the global room
        if (roomId === 'global') {
          await this._trimOldest(roomId);
        }
        console.log(`[messageManager] Message saved to MongoDB (room: ${roomId})`);
        return this._toClientShape(created);
      } catch (err) {
        console.error('[messageManager] DB save failed, falling back to memory:', err.message);
        // fall through to memory store below
      }
    } else {
      console.warn(`[messageManager] DB not available (readyState=${mongoose.connection.readyState}), saving to memory`);
    }

    const store = this._getMemoryStore(roomId);
    store.push(doc);
    if (roomId === 'global' && store.length > this.maxStoredMessages) {
      store.shift(); // drop oldest
    }
    return this._toClientShape(doc);
  }

  /**
   * Flushes any messages stored in memory back to MongoDB.
   * Called automatically when the DB connection is restored.
   */
  async _flushMemoryToDb() {
    if (this._flushing) return;

    const allStores = [...this.memoryStores.entries()];
    const totalCount = allStores.reduce((sum, [, arr]) => sum + arr.length, 0);
    if (totalCount === 0) return;

    this._flushing = true;
    console.log(`[messageManager] Flushing ${totalCount} in-memory messages to MongoDB...`);

    try {
      for (const [roomId, store] of allStores) {
        if (store.length > 0) {
          // Take a synchronous snapshot of the current messages and clear the array
          // to prevent race conditions while inserting.
          const messagesToInsert = [...store];
          this.memoryStores.set(roomId, []);

          try {
            await Message.insertMany(messagesToInsert, { ordered: true });
            if (roomId === 'global') {
              await this._trimOldest(roomId);
            }
          } catch (insertErr) {
            // If it fails, prepend the messages back so we don't lose them
            const currentStore = this._getMemoryStore(roomId);
            this.memoryStores.set(roomId, [...messagesToInsert, ...currentStore]);
            throw insertErr;
          }
        }
      }
      console.log(`[messageManager] Successfully flushed ${totalCount} messages to MongoDB`);
    } catch (err) {
      console.error('[messageManager] Failed to flush memory to DB:', err.message);
      // Keep them in memory, will retry on next reconnect
    } finally {
      this._flushing = false;
    }
  }

  /**
   * Deletes documents beyond the retention cap for a specific room, oldest first.
   */
  async _trimOldest(roomId = 'global') {
    const boundary = await Message.findOne({ roomId }, { createdAt: 1 })
      .sort({ createdAt: -1 })
      .skip(this.maxStoredMessages)
      .lean();

    if (!boundary) return; // still within the cap

    await Message.deleteMany({
      roomId,
      createdAt: { $lte: boundary.createdAt },
    });
  }

  /**
   * Returns up to `limit` most recent messages for a room, oldest first (chat order).
   * Used for the initial load when a user joins a room.
   */
  async getRecentHistory({ roomId = 'global', limit } = {}) {
    const fetchLimit = limit || this.initialLoadLimit;

    if (this._dbAvailable()) {
      try {
        const docs = await Message.find({ roomId })
          .sort({ createdAt: -1 })
          .limit(fetchLimit)
          .lean();

        const hasMore = docs.length === fetchLimit;
        console.log(`[messageManager] Loaded ${docs.length} messages from MongoDB (room: ${roomId})`);
        return {
          messages: docs.reverse().map((doc) => this._toClientShape(doc)),
          hasMore,
        };
      } catch (err) {
        console.error('[messageManager] DB read failed, using memory store:', err.message);
      }
    } else {
      console.warn(`[messageManager] DB not available for history (readyState=${mongoose.connection.readyState})`);
    }

    const store = this._getMemoryStore(roomId);
    const sliced = store.slice(-fetchLimit);
    return {
      messages: sliced.map((doc) => this._toClientShape(doc)),
      hasMore: store.length > fetchLimit,
    };
  }

  /**
   * Cursor-based pagination: returns `limit` messages older than `before` timestamp.
   * Used when the user scrolls to the top to load earlier messages.
   */
  async getOlderMessages({ roomId = 'global', before, limit } = {}) {
    const fetchLimit = limit || this.initialLoadLimit;
    const beforeDate = new Date(before);

    if (this._dbAvailable()) {
      try {
        const docs = await Message.find({
          roomId,
          createdAt: { $lt: beforeDate },
        })
          .sort({ createdAt: -1 })
          .limit(fetchLimit)
          .lean();

        const hasMore = docs.length === fetchLimit;
        return {
          messages: docs.reverse().map((doc) => this._toClientShape(doc)),
          hasMore,
        };
      } catch (err) {
        console.error('[messageManager] DB read failed for older messages:', err.message);
      }
    }

    // Fallback: scan memory store
    const store = this._getMemoryStore(roomId);
    const olderInMem = store.filter((d) => new Date(d.createdAt) < beforeDate);
    const sliced = olderInMem.slice(-fetchLimit);
    return {
      messages: sliced.map((doc) => this._toClientShape(doc)),
      hasMore: olderInMem.length > fetchLimit,
    };
  }

  _toClientShape(doc) {
    return {
      roomId: doc.roomId,
      userId: doc.userId,
      sessionId: doc.sessionId,
      nickname: doc.nickname,
      message: doc.message,
      createdAt: doc.createdAt,
    };
  }
}

module.exports = { MessageManager };
