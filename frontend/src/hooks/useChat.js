import { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '../services/socket';

const MAX_MESSAGE_LENGTH = 500;
const MAX_CLIENT_MESSAGES = 500;

/** Append a message and enforce the client-side retention cap. */
function appendMessage(prev, msg) {
  const next = [...prev, msg];
  return next.length > MAX_CLIENT_MESSAGES ? next.slice(-MAX_CLIENT_MESSAGES) : next;
}

/**
 * Encapsulates all chat state and socket wiring so components stay
 * purely presentational. Returns everything ChatWindow/App need.
 */
export function useChat() {
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // connecting | connected | disconnected
  const [selfId, setSelfId] = useState(null);
  const [selfSessionId, setSelfSessionId] = useState(null);
  const [selfNickname, setSelfNickname] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [messages, setMessages] = useState([]); // { type: 'message' | 'system', ... }
  const [rateLimitError, setRateLimitError] = useState(null);
  const rateLimitTimeoutRef = useRef(null);

  useEffect(() => {
    // Guard against React StrictMode double-mount: only connect if not
    // already connected/connecting.
    if (!socket.connected) {
      socket.connect();
    }

    const onConnect = () => {
      setConnectionStatus('connected');
      // Clear stale rate-limit errors from the previous session.
      setRateLimitError(null);
    };
    const onDisconnect = () => setConnectionStatus('disconnected');

    const onUserAssigned = ({ userId, sessionId, nickname }) => {
      setSelfId(userId);
      setSelfSessionId(sessionId);
      setSelfNickname(nickname);
    };

    const onChatHistory = (history) => {
      // Replace messages entirely — the server sends authoritative history
      // on every (re)connect, so this avoids duplicates.
      setMessages(
        history.map((m) => ({
          type: 'message',
          userId: m.userId,
          sessionId: m.sessionId,
          nickname: m.nickname,
          message: m.message,
          createdAt: m.createdAt,
        }))
      );
    };

    const onReceiveMessage = (m) => {
      setMessages((prev) =>
        appendMessage(prev, {
          type: 'message',
          userId: m.userId,
          sessionId: m.sessionId,
          nickname: m.nickname,
          message: m.message,
          createdAt: m.createdAt,
        })
      );
    };

    const onOnlineCount = (count) => setOnlineCount(count);

    const onUserJoined = ({ userId, nickname }) => {
      setMessages((prev) =>
        appendMessage(prev, {
          type: 'system',
          text: `#${userId} (${nickname}) joined the room`,
          id: `join-${userId}-${Date.now()}`,
        })
      );
    };

    const onUserLeft = ({ userId, nickname }) => {
      setMessages((prev) =>
        appendMessage(prev, {
          type: 'system',
          text: `#${userId} (${nickname}) left quietly`,
          id: `left-${userId}-${Date.now()}`,
        })
      );
    };

    const onRateLimit = ({ retryAfterMs }) => {
      setRateLimitError(
        `Slow down, tea spiller ☕ Try again in ${Math.ceil(retryAfterMs / 1000)}s`
      );
      clearTimeout(rateLimitTimeoutRef.current);
      rateLimitTimeoutRef.current = setTimeout(() => setRateLimitError(null), retryAfterMs || 2000);
    };

    const onServerError = (err) => {
      console.error('[chat] server error:', err);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('user_assigned', onUserAssigned);
    socket.on('chat_history', onChatHistory);
    socket.on('receive_message', onReceiveMessage);
    socket.on('online_count', onOnlineCount);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
    socket.on('rate_limit', onRateLimit);
    socket.on('error', onServerError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('user_assigned', onUserAssigned);
      socket.off('chat_history', onChatHistory);
      socket.off('receive_message', onReceiveMessage);
      socket.off('online_count', onOnlineCount);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
      socket.off('rate_limit', onRateLimit);
      socket.off('error', onServerError);
      clearTimeout(rateLimitTimeoutRef.current);
      socket.disconnect();
    };
  }, []);

  const sendMessage = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return;
    socket.emit('send_message', { message: trimmed });
  }, []);

  return {
    connectionStatus,
    selfId,
    selfSessionId,
    selfNickname,
    onlineCount,
    messages,
    rateLimitError,
    sendMessage,
    maxMessageLength: MAX_MESSAGE_LENGTH,
  };
}

