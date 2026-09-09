const mongoose = require('mongoose');
const Message = require('../models/Message');

/**
 * MessageManager
 * ---------------
 * Owns message persistence and the 1000-message retention policy.
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
  constructor({ maxStoredMessages = 1000 } = {}) {
    this.maxStoredMessages = maxStoredMessages;

    // Fallback in-memory store: plain array used as a bounded queue.
    this.memoryStore = [];
    this._flushing = false;

    // Listen for DB reconnections so we can flush in-memory messages
    mongoose.connection.on('connected', () => {
      this._flushMemoryToDb();
    });
  }

  _dbAvailable() {
    return mongoose.connection.readyState === 1; // 1 = connected
  }

  /**
   * Persists a message and enforces the retention cap.
   * Returns the stored message in a plain, client-safe shape.
   */
  async saveMessage({ userId, sessionId, nickname, message }) {
    const doc = {
      userId,
      sessionId,
      nickname,
      message,
      createdAt: new Date(),
    };

    if (this._dbAvailable()) {
      try {
        const created = await Message.create(doc);
        await this._trimOldest();
        console.log('[messageManager] Message saved to MongoDB');
        return this._toClientShape(created);
      } catch (err) {
        console.error('[messageManager] DB save failed, falling back to memory:', err.message);
        // fall through to memory store below
      }
    } else {
      console.warn(`[messageManager] DB not available (readyState=${require('mongoose').connection.readyState}), saving to memory`);
    }

    this.memoryStore.push(doc);
    if (this.memoryStore.length > this.maxStoredMessages) {
      this.memoryStore.shift(); // drop oldest
    }
    return this._toClientShape(doc);
  }

  /**
   * Flushes any messages stored in memory back to MongoDB.
   * Called automatically when the DB connection is restored.
   */
  async _flushMemoryToDb() {
    if (this._flushing || this.memoryStore.length === 0) return;
    this._flushing = true;

    const count = this.memoryStore.length;
    console.log(`[messageManager] Flushing ${count} in-memory messages to MongoDB...`);

    try {
      // insertMany is more efficient than individual creates
      await Message.insertMany(this.memoryStore, { ordered: true });
      this.memoryStore = [];
      await this._trimOldest();
      console.log(`[messageManager] Successfully flushed ${count} messages to MongoDB`);
    } catch (err) {
      console.error('[messageManager] Failed to flush memory to DB:', err.message);
      // Keep them in memory, will retry on next reconnect
    } finally {
      this._flushing = false;
    }
  }

  /**
   * Deletes documents beyond the retention cap, oldest first.
   * Uses a single skip-based query to find the cutoff point, then one
   * bulk delete — 2 queries instead of the previous 3.
   */
  async _trimOldest() {
    // Find the createdAt of the Nth-newest document (the retention boundary).
    // Everything older than this should be deleted.
    const boundary = await Message.findOne({}, { createdAt: 1 })
      .sort({ createdAt: -1 })
      .skip(this.maxStoredMessages)
      .lean();

    if (!boundary) return; // still within the cap

    // Delete by createdAt (not _id) — _id ordering is unreliable after
    // bulk insertMany flushes from the in-memory fallback store.
    await Message.deleteMany({ createdAt: { $lte: boundary.createdAt } });
  }

  /** Returns up to `limit` most recent messages, oldest first (chat order). */
  async getRecentHistory(limit = 1000) {
    if (this._dbAvailable()) {
      try {
        const docs = await Message.find({})
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
        console.log(`[messageManager] Loaded ${docs.length} messages from MongoDB`);
        return docs.reverse().map((doc) => this._toClientShape(doc));
      } catch (err) {
        console.error('[messageManager] DB read failed, using memory store:', err.message);
      }
    } else {
      console.warn(`[messageManager] DB not available for history (readyState=${require('mongoose').connection.readyState}), returning ${this.memoryStore.length} in-memory messages`);
    }
    return this.memoryStore.slice(-limit).map((doc) => this._toClientShape(doc));
  }

  _toClientShape(doc) {
    return {
      userId: doc.userId,
      sessionId: doc.sessionId,
      nickname: doc.nickname,
      message: doc.message,
      createdAt: doc.createdAt,
    };
  }
}

module.exports = { MessageManager };
