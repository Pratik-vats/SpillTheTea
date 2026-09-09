const mongoose = require('mongoose');

/**
 * MongoDB connection with automatic reconnection.
 *
 * Key fixes for Atlas disconnection issues:
 * 1. heartbeatFrequencyMS — pings the DB every 10s so Atlas never considers
 *    the connection idle and doesn't close it (default was 30s, Atlas idle
 *    timeout is ~5 min but proxies/load-balancers can be shorter).
 * 2. socketTimeoutMS — prevents hanging sockets from stalling indefinitely.
 * 3. serverSelectionTimeoutMS — gives enough time for Atlas cold-start but
 *    doesn't wait forever.
 * 4. maxIdleTimeMS — closes truly idle pooled connections before Atlas does,
 *    so Mongoose reopens them cleanly instead of getting a broken pipe.
 * 5. Auto-reconnect logic on 'disconnected' event with exponential backoff.
 */

let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY_MS = 30_000; // cap at 30s between retries

async function connectDatabase(uri) {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    console.log('[db] MongoDB connected');
    reconnectAttempts = 0; // reset backoff on successful connection
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB disconnected');
    scheduleReconnect(uri);
  });

  await mongoose.connect(uri, {
    // --- Timeouts ---
    serverSelectionTimeoutMS: 10_000,   // 10s to pick a server (Atlas cold-start)
    socketTimeoutMS: 45_000,            // 45s socket timeout for operations
    connectTimeoutMS: 10_000,           // 10s to establish TCP connection

    // --- TLS / SSL ---
    // NOTE: Do NOT set `tls: true` here — the `mongodb+srv://` URI scheme
    // enables TLS automatically. Forcing it explicitly can cause handshake
    // conflicts and silent connection failures on some driver versions.

    // --- Keep-alive & heartbeat ---
    heartbeatFrequencyMS: 10_000,       // ping every 10s (prevents idle disconnect)
    maxIdleTimeMS: 60_000,              // close idle pool connections after 60s
                                        // (avoids Atlas closing them with a RST)

    // --- Connection pool ---
    maxPoolSize: 10,                    // enough for a small chat app
    minPoolSize: 2,                     // keep 2 warm connections ready

    // --- Buffering ---
    bufferCommands: true,               // queue operations during brief disconnects
    // (Mongoose reconnects automatically via the driver; bufferCommands lets
    //  operations that fire during the reconnect window succeed once it's back.)

    // --- Monitoring ---
    appName: 'anon-chat',               // shows up in Atlas monitoring / logs
  });

  console.log(`[db] Initial connection readyState: ${mongoose.connection.readyState}`);
}

/**
 * Schedules a reconnection attempt with exponential backoff.
 * Mongoose's driver does internal reconnection, but if the connection object
 * itself is destroyed (e.g. Atlas maintenance, network partition) we need
 * to call mongoose.connect() again explicitly.
 */
function scheduleReconnect(uri) {
  if (reconnectTimer) return; // already scheduled

  const delay = Math.min(
    1000 * Math.pow(2, reconnectAttempts), // 1s, 2s, 4s, 8s, 16s, 30s...
    MAX_RECONNECT_DELAY_MS
  );
  reconnectAttempts++;

  console.log(`[db] Scheduling reconnection attempt #${reconnectAttempts} in ${delay}ms...`);

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      console.log(`[db] Attempting reconnection #${reconnectAttempts}...`);
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 45_000,
        connectTimeoutMS: 10_000,
        heartbeatFrequencyMS: 10_000,
        maxIdleTimeMS: 60_000,
        maxPoolSize: 10,
        minPoolSize: 2,
        bufferCommands: true,
        appName: 'anon-chat',
      });
    } catch (err) {
      console.error(`[db] Reconnection attempt #${reconnectAttempts} failed:`, err.message);
      // The 'disconnected' event will fire again and re-trigger scheduleReconnect
    }
  }, delay);
}

module.exports = { connectDatabase };
