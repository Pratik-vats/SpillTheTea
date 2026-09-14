const { UserManager } = require('../services/userManager');
const { RateLimiter } = require('../services/rateLimiter');
const { MessageManager } = require('../services/messageManager');
const { RoomManager } = require('../services/roomManager');
const { validateMessage, getClientIp } = require('../middleware/security');

/**
 * Wires up all Socket.IO events for the anonymous multi-room chat.
 *
 * Responsibilities are deliberately split:
 *  - UserManager: who's connected, their numeric id, connection caps
 *  - RateLimiter: spam prevention
 *  - MessageManager: persistence + retention + pagination
 *  - RoomManager: room lifecycle, join/leave, cleanup
 *  - This file: the actual event wiring/orchestration
 */
function registerChatSocket(io, options = {}) {
  const userManager = new UserManager({
    maxConnectionsPerIp: options.maxConnectionsPerIp || 5,
  });

  const rateLimiter = new RateLimiter({
    maxMessages: options.rateLimitMaxMessages || 5,
    windowMs: options.rateLimitWindowMs || 10_000,
  });

  const messageManager = new MessageManager({
    maxStoredMessages: options.maxStoredMessages || 1000,
    initialLoadLimit: options.initialLoadLimit || 50,
  });

  const roomManager = new RoomManager();

  // Initialize room manager (seeds global room, loads persisted rooms)
  roomManager.init().catch((err) => {
    console.error('[chatSocket] Failed to initialize roomManager:', err.message);
  });

  /**
   * Broadcasts the online count for a specific room to everyone in that room.
   */
  function broadcastRoomOnlineCount(roomId) {
    const count = roomManager.getRoomOnlineCount(roomId);
    io.to(roomId).emit('room_online_count', { roomId, count });
  }

  /**
   * Broadcasts the updated public rooms list to ALL connected clients.
   */
  function broadcastPublicRooms() {
    io.emit('public_rooms', roomManager.getPublicRooms());
  }

  io.on('connection', async (socket) => {
    const ip = getClientIp(socket);

    // --- Connection protection: cap simultaneous connections per IP ---
    if (!userManager.canConnect(ip)) {
      socket.emit('error', {
        code: 'TOO_MANY_CONNECTIONS',
        message: 'Too many simultaneous connections from this network.',
      });
      socket.disconnect(true);
      return;
    }

    const { userId, sessionId, nickname } = userManager.addSession(socket.id, ip);

    // Track which room this socket is currently in
    socket.currentRoom = null;

    // Tell this client who they are.
    socket.emit('user_assigned', { userId, sessionId, nickname });

    // Send the list of public rooms immediately.
    socket.emit('public_rooms', roomManager.getPublicRooms());

    // --- Auto-join a room (from query param or default to global) ---
    const requestedRoom = socket.handshake.query.room || 'global';
    const targetRoom = roomManager.roomExists(requestedRoom) ? requestedRoom : 'global';
    await joinSocketToRoom(socket, targetRoom, userId, nickname);

    // --- Join Room event (switching rooms) ---
    socket.on('join_room', async ({ roomId }, ack) => {
      if (!roomId || !roomManager.roomExists(roomId)) {
        const err = { code: 'ROOM_NOT_FOUND', message: 'Room does not exist.' };
        if (typeof ack === 'function') ack({ ok: false, error: err });
        return;
      }

      const session = userManager.getSession(socket.id);
      if (!session) return;

      await joinSocketToRoom(socket, roomId, session.userId, session.nickname);
      if (typeof ack === 'function') ack({ ok: true });
    });

    // --- Create Room event ---
    socket.on('create_room', async ({ name, isPublic }, ack) => {
      const session = userManager.getSession(socket.id);
      if (!session) return;

      try {
        const room = await roomManager.createRoom({
          name,
          isPublic: !!isPublic,
          creatorSessionId: session.sessionId,
        });

        // Broadcast updated public rooms list to everyone
        broadcastPublicRooms();

        if (typeof ack === 'function') ack({ ok: true, room });
      } catch (err) {
        console.error('[chatSocket] create_room failed:', err.message);
        if (typeof ack === 'function') {
          ack({ ok: false, error: { code: 'CREATE_FAILED', message: err.message } });
        }
      }
    });

    // --- Get public rooms ---
    socket.on('get_public_rooms', (_, ack) => {
      if (typeof ack === 'function') {
        ack({ ok: true, rooms: roomManager.getPublicRooms() });
      }
    });

    // --- Load older messages (scroll-up pagination) ---
    socket.on('load_older_messages', async ({ roomId, before }, ack) => {
      if (!roomId || !before) {
        if (typeof ack === 'function') ack({ ok: false, error: { code: 'BAD_REQUEST' } });
        return;
      }

      try {
        const result = await messageManager.getOlderMessages({ roomId, before });
        if (typeof ack === 'function') {
          ack({ ok: true, messages: result.messages, hasMore: result.hasMore });
        }
      } catch (err) {
        console.error('[chatSocket] load_older_messages failed:', err.message);
        if (typeof ack === 'function') ack({ ok: false, error: { code: 'SERVER_ERROR' } });
      }
    });

    // --- Incoming message handling ---
    socket.on('send_message', async (payload, ack) => {
      userManager.touchActivity(socket.id);

      const session = userManager.getSession(socket.id);
      if (!session) return;

      const roomId = socket.currentRoom || 'global';

      const { allowed, retryAfterMs } = rateLimiter.attempt(socket.id);
      console.log(`[chatSocket] rateLimiter attempt for ${socket.id}: allowed=${allowed}`);
      if (!allowed) {
        const err = {
          code: 'RATE_LIMITED',
          message: 'You are sending messages too quickly.',
          retryAfterMs,
        };
        socket.emit('rate_limit', err);
        if (typeof ack === 'function') ack({ ok: false, error: err });
        return;
      }

      const rawText = payload && typeof payload === 'object' ? payload.message : payload;
      const validation = validateMessage(rawText);

      if (!validation.ok) {
        const err = { code: 'INVALID_MESSAGE', message: validation.reason };
        socket.emit('error', err);
        if (typeof ack === 'function') ack({ ok: false, error: err });
        return;
      }

      try {
        const saved = await messageManager.saveMessage({
          roomId,
          userId: session.userId,
          sessionId: session.sessionId,
          nickname: session.nickname,
          message: validation.message,
        });

        io.to(roomId).emit('receive_message', saved);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        console.error('[chatSocket] failed to save message:', err.message);
        const errPayload = { code: 'SERVER_ERROR', message: 'Could not send message.' };
        socket.emit('error', errPayload);
        if (typeof ack === 'function') ack({ ok: false, error: errPayload });
      }
    });

    // --- Disconnect ---
    socket.on('disconnect', () => {
      const removed = userManager.removeSession(socket.id);
      rateLimiter.clear(socket.id);

      if (removed && socket.currentRoom) {
        const roomId = socket.currentRoom;
        roomManager.leaveRoom(socket.id, roomId);

        broadcastRoomOnlineCount(roomId);
        broadcastPublicRooms();

        socket.to(roomId).emit('user_left', {
          userId: removed.userId,
          nickname: removed.nickname,
        });
      }
    });

    // Defensive: never let one bad client crash the process.
    socket.on('error', (err) => {
      console.error(`[chatSocket] socket error (${socket.id}):`, err.message);
    });
  });

  /**
   * Helper: transitions a socket from its current room to a new room.
   * Handles leave -> join -> history delivery -> broadcast notifications.
   */
  async function joinSocketToRoom(socket, roomId, userId, nickname) {
    // Leave the old room if any
    if (socket.currentRoom && socket.currentRoom !== roomId) {
      const oldRoom = socket.currentRoom;
      socket.leave(oldRoom);
      roomManager.leaveRoom(socket.id, oldRoom);
      broadcastRoomOnlineCount(oldRoom);
      broadcastPublicRooms();
      socket.to(oldRoom).emit('user_left', { userId, nickname });
    }

    // Join the new room
    socket.join(roomId);
    socket.currentRoom = roomId;
    roomManager.joinRoom(socket.id, roomId);

    // Send room metadata
    const roomInfo = roomManager.getRoom(roomId);
    socket.emit('room_joined', roomInfo);

    // Send recent chat history (initial 50 messages)
    try {
      const { messages, hasMore } = await messageManager.getRecentHistory({ roomId });
      socket.emit('chat_history', { messages, hasMore });
    } catch (err) {
      console.error('[chatSocket] failed to load history:', err.message);
      socket.emit('chat_history', { messages: [], hasMore: false });
    }

    broadcastRoomOnlineCount(roomId);
    broadcastPublicRooms();
    socket.to(roomId).emit('user_joined', { userId, nickname });
  }
}

module.exports = { registerChatSocket };
