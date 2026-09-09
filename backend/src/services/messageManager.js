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
        return this._toClientShape(created);
      } catch (err) {
        console.error('[messageManager] DB save failed, falling back to memory:', err.message);
        // fall through to memory store below
      }
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
    // Find the _id of the Nth-newest document (the retention boundary).
    // Everything older than this should be deleted.
    const boundary = await Message.findOne({}, { _id: 1 })
      .sort({ createdAt: -1 })
      .skip(this.maxStoredMessages)
      .lean();

    if (!boundary) return; // still within the cap

    await Message.deleteMany({ _id: { $lte: boundary._id } });
  }

  /** Returns up to `limit` most recent messages, oldest first (chat order). */
  async getRecentHistory(limit = 1000) {
    if (this._dbAvailable()) {
      try {
        const docs = await Message.find({})
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
        return docs.reverse().map((doc) => this._toClientShape(doc));
      } catch (err) {
        console.error('[messageManager] DB read failed, using memory store:', err.message);
      }
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
