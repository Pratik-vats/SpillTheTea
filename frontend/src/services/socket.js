import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

/**
 * A single shared socket instance for the whole app.
 * autoConnect is disabled so the useChat hook controls connection
 * lifecycle explicitly (and to make reconnection/cleanup predictable).
 */
export const socket = io(SERVER_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  transports: ['websocket', 'polling'], // prefer WS; avoids proxy upgrade issues
});
