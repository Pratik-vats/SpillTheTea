require('dotenv').config();

const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const { createApp } = require('./app');
const { connectDatabase } = require('./config/database');
const { registerChatSocket } = require('./sockets/chatSocket');

const PORT = Number(process.env.PORT || 5000);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/anon-chat';
// Support comma-separated origins for multi-environment CORS
// e.g. CLIENT_URL=https://your-app.vercel.app,http://localhost:5173
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const allowedOrigins = CLIENT_URL.split(',').map((u) => u.trim()).filter(Boolean);

async function main() {
  const app = createApp({ allowedOrigins });
  const server = http.createServer(app);

  // Try to connect to MongoDB first, before accepting socket connections,
  // so that early arrivals don't silently fall through to the in-memory store.
  try {
    await connectDatabase(MONGODB_URI);
  } catch (err) {
    console.error('[server] Could not connect to MongoDB, starting in degraded (in-memory) mode:', err.message);
  }

  // Application-level keep-alive: ping MongoDB every 4 minutes to prevent
  // Atlas/proxies from killing the connection due to inactivity.
  // This complements the driver-level heartbeat (10s) but operates at a
  // higher level, catching edge cases where the driver thinks it's connected
  // but the socket has been silently closed by an intermediate proxy.
  const DB_PING_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes
  setInterval(async () => {
    if (mongoose.connection.readyState === 1) {
      try {
        await mongoose.connection.db.admin().ping();
      } catch (err) {
        console.warn('[server] DB keep-alive ping failed:', err.message);
        // The 'disconnected' event + reconnect logic in database.js will handle recovery
      }
    }
  }, DB_PING_INTERVAL_MS);

  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 20 * 1024, // 20KB — plenty for a 500-char text message
    pingTimeout: 60000,           // wait 60s before considering a client dead
    pingInterval: 25000,          // ping clients every 25s to keep WebSocket alive
  });

  registerChatSocket(io, {
    maxConnectionsPerIp: Number(process.env.MAX_CONNECTIONS_PER_IP || 5),
    rateLimitMaxMessages: Number(process.env.RATE_LIMIT_MAX_MESSAGES || 5),
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 10_000),
    maxStoredMessages: Number(process.env.MAX_STORED_MESSAGES || 1000),
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] Anonymous chat server listening on port ${PORT}`);
  });

  // Never let one unhandled rejection take the whole process down.
  process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled rejection:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('[server] Uncaught exception:', err);
  });
}

main();

