const crypto = require('crypto');
const mongoose = require('mongoose');
const Room = require('../models/Room');
const Message = require('../models/Message');

/**
 * RoomManager
 * -----------
 * Manages room lifecycle: creation, join/leave tracking, public room listing,
 * and auto-cleanup of empty custom rooms after 1 hour.
 *
 * In-memory state is the source of truth for live socket counts; MongoDB
 * stores room metadata for persistence across restarts.
 */

const CLEANUP_INTERVAL_MS = 60 * 1000;          // check every 60 seconds
const EMPTY_ROOM_TTL_MS   = 60 * 60 * 1000;     // 1 hour

const GLOBAL_ROOM = {
  roomId: 'global',
  name: 'Global Lounge',
  isPublic: true,
  isPermanent: true,
};

/**
 * Generate a short, URL-friendly room ID like "tea-a7x9".
 * 4 random hex chars gives 65 536 possible slugs — more than enough.
 */
function generateRoomId() {
  const suffix = crypto.randomBytes(2).toString('hex');
  return `tea-${suffix}`;
}

class RoomManager {
  constructor() {
    // roomId -> { name, isPublic, isPermanent, activeSockets: Set<socketId>, emptySince }
    this._rooms = new Map();
    this._cleanupTimer = null;
  }

  _dbAvailable() {
    return mongoose.connection.readyState === 1; // 1 = connected
  }

  _seedGlobalRoomInMemory() {
    if (!this._rooms.has(GLOBAL_ROOM.roomId)) {
      this._rooms.set(GLOBAL_ROOM.roomId, {
        ...GLOBAL_ROOM,
        activeSockets: new Set(),
        emptySince: null,
      });
    }
  }

  /**
   * Call once at startup. Seeds the global room (in memory + DB) and loads
   * any surviving rooms from the database.
   */
  async init() {
    // Always make the global room available synchronously. This preserves the
    // app's degraded in-memory mode when MongoDB is unreachable at startup.
    this._seedGlobalRoomInMemory();

    if (!this._dbAvailable()) {
      this._startCleanupTimer();
      console.warn('[roomManager] MongoDB unavailable; initialized with in-memory rooms only.');
      return;
    }

    // Seed global room in DB if it doesn't exist
    await Room.findOneAndUpdate(
      { roomId: GLOBAL_ROOM.roomId },
      { $setOnInsert: GLOBAL_ROOM },
      { upsert: true }
    );

    // Load any previously persisted rooms
    const savedRooms = await Room.find({}).lean();
    for (const r of savedRooms) {
      if (!this._rooms.has(r.roomId)) {
        this._rooms.set(r.roomId, {
          roomId: r.roomId,
          name: r.name,
          isPublic: r.isPublic,
          isPermanent: r.isPermanent,
          activeSockets: new Set(),
          emptySince: r.emptySince || new Date(), // mark as empty since nobody is connected after restart
        });
      }
    }

    // Start the periodic cleanup timer
    this._startCleanupTimer();
    console.log('[roomManager] Initialized with rooms:', [...this._rooms.keys()]);
  }

  _startCleanupTimer() {
    if (!this._cleanupTimer) {
      this._cleanupTimer = setInterval(() => this._cleanupEmptyRooms(), CLEANUP_INTERVAL_MS);
    }
  }

  /**
   * Creates a new room. Returns the room object or throws if name is invalid.
   */
  async createRoom({ name, isPublic = true, creatorSessionId = null }) {
    const trimmedName = (name || '').trim().slice(0, 40);
    if (!trimmedName) throw new Error('Room name is required.');

    const roomId = generateRoomId();

    const roomData = {
      roomId,
      name: trimmedName,
      isPublic: !!isPublic,
      isPermanent: false,
      createdBySessionId: creatorSessionId,
    };

    if (this._dbAvailable()) {
      // Persist to DB when possible. In degraded mode, room metadata remains
      // in memory just like messages do.
      await Room.create(roomData);
    } else {
      console.warn(`[roomManager] DB unavailable, creating in-memory room: ${roomId}`);
    }

    // Add to in-memory tracker
    this._rooms.set(roomId, {
      ...roomData,
      activeSockets: new Set(),
      emptySince: null, // creator is about to join
    });

    console.log(`[roomManager] Room created: ${roomId} ("${trimmedName}", ${isPublic ? 'public' : 'private'})`);
    return { roomId, name: trimmedName, isPublic: !!isPublic };
  }

  /**
   * Registers a socket as present in a room. Clears emptySince if the room
   * was previously empty.
   */
  joinRoom(socketId, roomId) {
    const room = this._rooms.get(roomId);
    if (!room) return false;

    room.activeSockets.add(socketId);
    if (room.emptySince) {
      room.emptySince = null;
      // Persist the cleared timestamp
      if (this._dbAvailable()) {
        Room.updateOne({ roomId }, { $set: { emptySince: null } }).catch(() => {});
      }
    }
    return true;
  }

  /**
   * Removes a socket from a room. If the room becomes empty and isn't
   * permanent, starts the auto-delete countdown.
   */
  leaveRoom(socketId, roomId) {
    const room = this._rooms.get(roomId);
    if (!room) return;

    room.activeSockets.delete(socketId);

    if (room.activeSockets.size === 0 && !room.isPermanent) {
      room.emptySince = new Date();
      if (this._dbAvailable()) {
        Room.updateOne({ roomId }, { $set: { emptySince: room.emptySince } }).catch(() => {});
      }
      console.log(`[roomManager] Room "${roomId}" is now empty, auto-delete in 1 hour.`);
    }
  }

  /**
   * Returns a list of public rooms with live participant counts, sorted by
   * active users descending.
   */
  getPublicRooms() {
    const list = [];
    for (const [, room] of this._rooms) {
      if (room.isPublic) {
        list.push({
          roomId: room.roomId,
          name: room.name,
          isPermanent: room.isPermanent,
          activeUsers: room.activeSockets.size,
        });
      }
    }
    // Sort: permanent rooms first, then by active users desc
    list.sort((a, b) => {
      if (a.isPermanent !== b.isPermanent) return b.isPermanent - a.isPermanent;
      return b.activeUsers - a.activeUsers;
    });
    return list;
  }

  /** Returns the in-memory room object if it exists. */
  getRoom(roomId) {
    const room = this._rooms.get(roomId);
    if (!room) return null;
    return {
      roomId: room.roomId,
      name: room.name,
      isPublic: room.isPublic,
      isPermanent: room.isPermanent,
      activeUsers: room.activeSockets.size,
    };
  }

  /** Checks if a room exists (in memory). */
  roomExists(roomId) {
    return this._rooms.has(roomId);
  }

  /** Get the active user count for a specific room. */
  getRoomOnlineCount(roomId) {
    const room = this._rooms.get(roomId);
    return room ? room.activeSockets.size : 0;
  }

  /**
   * Background cleanup: delete any non-permanent room that has been empty
   * for >= EMPTY_ROOM_TTL_MS. Removes the room record + all its messages.
   */
  async _cleanupEmptyRooms() {
    const now = Date.now();

    for (const [roomId, room] of this._rooms) {
      if (room.isPermanent) continue;
      if (!room.emptySince) continue;
      if (room.activeSockets.size > 0) continue;

      const elapsed = now - new Date(room.emptySince).getTime();
      if (elapsed >= EMPTY_ROOM_TTL_MS) {
        console.log(`[roomManager] Auto-deleting empty room "${roomId}" (empty for ${Math.round(elapsed / 60000)} min)`);
        try {
          if (this._dbAvailable()) {
            await Message.deleteMany({ roomId });
            await Room.deleteOne({ roomId });
          }
          this._rooms.delete(roomId);
        } catch (err) {
          console.error(`[roomManager] Failed to cleanup room "${roomId}":`, err.message);
        }
      }
    }
  }

  /** Graceful shutdown. */
  destroy() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }
}

module.exports = { RoomManager };
