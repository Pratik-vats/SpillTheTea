const { UserManager } = require('../services/userManager');
const { RateLimiter } = require('../services/rateLimiter');
const { MessageManager } = require('../services/messageManager');
const { validateMessage, getClientIp } = require('../middleware/security');

/**
 * Wires up all Socket.IO events for the anonymous chat.
 *
 * Responsibilities are deliberately split:
 *  - UserManager: who's connected, their numeric id, connection caps
 *  - RateLimiter: spam prevention
 *  - MessageManager: persistence + 1000-message retention
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
  });

  function broadcastOnlineCount() {
    io.emit('online_count', userManager.getOnlineCount());
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

    // Tell this client who they are.
    socket.emit('user_assigned', { userId, sessionId, nickname });

    // Send recent chat history so the new user has context.
    try {
      const history = await messageManager.getRecentHistory();
      socket.emit('chat_history', history);
    } catch (err) {
      console.error('[chatSocket] failed to load history:', err.message);
      socket.emit('chat_history', []);
    }

    broadcastOnlineCount();
    socket.broadcast.emit('user_joined', { userId, nickname });

    // --- Incoming message handling ---
    socket.on('send_message', async (payload, ack) => {
      userManager.touchActivity(socket.id);

      const session = userManager.getSession(socket.id);
      if (!session) return; // stale/disconnected socket

      const { allowed, retryAfterMs } = rateLimiter.attempt(socket.id);
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
          userId: session.userId,
          sessionId: session.sessionId,
          nickname: session.nickname,
          message: validation.message,
        });

        io.emit('receive_message', saved);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        console.error('[chatSocket] failed to save message:', err.message);
        const errPayload = { code: 'SERVER_ERROR', message: 'Could not send message.' };
        socket.emit('error', errPayload);
        if (typeof ack === 'function') ack({ ok: false, error: errPayload });
      }
    });

    socket.on('disconnect', () => {
      const removed = userManager.removeSession(socket.id);
      rateLimiter.clear(socket.id);

      if (removed) {
        broadcastOnlineCount();
        socket.broadcast.emit('user_left', {
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
}

module.exports = { registerChatSocket };
