const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

function createApp({ allowedOrigins }) {
  const app = express();

  // Trust the first proxy hop so socket.handshake.address and
  // x-forwarded-for give the real client IP behind load balancers.
  app.set('trust proxy', 1);

  // Security headers (X-Content-Type-Options, Strict-Transport-Security, etc.)
  app.use(helmet());

  app.use(cors({ origin: allowedOrigins, credentials: false }));
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Fallback 404 for anything else — this is a socket-first app, the
  // HTTP surface only exists for health checks and the Socket.IO handshake.
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}

module.exports = { createApp };
