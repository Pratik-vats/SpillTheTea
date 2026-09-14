import { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '../services/socket';

const MAX_MESSAGE_LENGTH = 500;
const MAX_CLIENT_MESSAGES = 500;

/** Append a message and enforce the client-side retention cap. */
function appendMessage(prev, msg) {
  const next = [...prev, msg];
  return next.length > MAX_CLIENT_MESSAGES ? next.slice(-MAX_CLIENT_MESSAGES) : next;
}

/** Read the initial room from the URL query param ?room=xxx */
function getRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('room') || 'global';
}

/**
 * Encapsulates all chat state, room management, pagination, and socket wiring
 * so components stay purely presentational.
 */
export function useChat() {
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [selfId, setSelfId] = useState(null);
  const [selfSessionId, setSelfSessionId] = useState(null);
  const [selfNickname, setSelfNickname] = useState(null);
  const [messages, setMessages] = useState([]);
  const [rateLimitError, setRateLimitError] = useState(null);
  const rateLimitTimeoutRef = useRef(null);

  // Room state
  const [currentRoom, setCurrentRoom] = useState(null);
  const [currentRoomInfo, setCurrentRoomInfo] = useState(null);
  const [publicRooms, setPublicRooms] = useState([]);
  const [roomOnlineCount, setRoomOnlineCount] = useState(0);

  // Pagination state
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // Share link toast
  const [shareToast, setShareToast] = useState(false);
  const shareToastRef = useRef(null);

  useEffect(() => {
    if (!socket.connected) {
      socket.io.opts.query = { room: getRoomFromUrl() };
      socket.connect();
    }

    const onConnect = () => {
      setConnectionStatus('connected');
      setRateLimitError(null);
    };
    const onDisconnect = () => setConnectionStatus('disconnected');

    const onUserAssigned = ({ userId, sessionId, nickname }) => {
      setSelfId(userId);
      setSelfSessionId(sessionId);
      setSelfNickname(nickname);
    };

    const onRoomJoined = (roomInfo) => {
      setCurrentRoom(roomInfo.roomId);
      setCurrentRoomInfo(roomInfo);
      // Update URL
      const newUrl = roomInfo.roomId === 'global'
        ? window.location.pathname
        : `${window.location.pathname}?room=${roomInfo.roomId}`;
      window.history.replaceState(null, '', newUrl);
    };

    const onChatHistory = ({ messages: history, hasMore }) => {
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
      setHasMoreMessages(hasMore);
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

    const onRoomOnlineCount = ({ count }) => setRoomOnlineCount(count);

    const onPublicRooms = (rooms) => setPublicRooms(rooms);

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
    socket.on('room_joined', onRoomJoined);
    socket.on('chat_history', onChatHistory);
    socket.on('receive_message', onReceiveMessage);
    socket.on('room_online_count', onRoomOnlineCount);
    socket.on('public_rooms', onPublicRooms);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
    socket.on('rate_limit', onRateLimit);
    socket.on('error', onServerError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('user_assigned', onUserAssigned);
      socket.off('room_joined', onRoomJoined);
      socket.off('chat_history', onChatHistory);
      socket.off('receive_message', onReceiveMessage);
      socket.off('room_online_count', onRoomOnlineCount);
      socket.off('public_rooms', onPublicRooms);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
      socket.off('rate_limit', onRateLimit);
      socket.off('error', onServerError);
      clearTimeout(rateLimitTimeoutRef.current);
      clearTimeout(shareToastRef.current);
      socket.disconnect();
    };
  }, []);

  // --- Actions ---

  const sendMessage = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return;
    socket.emit('send_message', { message: trimmed });
  }, []);

  const joinRoom = useCallback((roomId) => {
    if (roomId === currentRoom) return;
    socket.emit('join_room', { roomId }, (res) => {
      if (!res?.ok) {
        console.error('[chat] join_room failed:', res?.error);
      }
    });
  }, [currentRoom]);

  const createRoom = useCallback(({ name, isPublic }) => {
    return new Promise((resolve, reject) => {
      socket.emit('create_room', { name, isPublic }, (res) => {
        if (res?.ok) {
          // Auto-join the newly created room
          socket.emit('join_room', { roomId: res.room.roomId });
          resolve(res.room);
        } else {
          reject(new Error(res?.error?.message || 'Failed to create room'));
        }
      });
    });
  }, []);

  const loadOlderMessages = useCallback(() => {
    if (loadingOlder || !hasMoreMessages || !currentRoom) return;

    // Find the oldest message's createdAt as our cursor
    const firstMessage = messages.find((m) => m.type === 'message');
    if (!firstMessage) return;

    setLoadingOlder(true);

    socket.emit(
      'load_older_messages',
      { roomId: currentRoom, before: firstMessage.createdAt },
      (res) => {
        setLoadingOlder(false);
        if (res?.ok) {
          const olderMsgs = res.messages.map((m) => ({
            type: 'message',
            userId: m.userId,
            sessionId: m.sessionId,
            nickname: m.nickname,
            message: m.message,
            createdAt: m.createdAt,
          }));
          setMessages((prev) => [...olderMsgs, ...prev]);
          setHasMoreMessages(res.hasMore);
        }
      }
    );
  }, [loadingOlder, hasMoreMessages, currentRoom, messages]);

  const copyInviteLink = useCallback(() => {
    if (!currentRoom) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareToast(true);
      clearTimeout(shareToastRef.current);
      shareToastRef.current = setTimeout(() => setShareToast(false), 2500);
    }).catch(() => {
      // Fallback for non-secure contexts
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setShareToast(true);
      clearTimeout(shareToastRef.current);
      shareToastRef.current = setTimeout(() => setShareToast(false), 2500);
    });
  }, [currentRoom]);

  return {
    connectionStatus,
    selfId,
    selfSessionId,
    selfNickname,
    messages,
    rateLimitError,
    sendMessage,
    maxMessageLength: MAX_MESSAGE_LENGTH,
    // Room
    currentRoom,
    currentRoomInfo,
    publicRooms,
    roomOnlineCount,
    joinRoom,
    createRoom,
    // Pagination
    hasMoreMessages,
    loadingOlder,
    loadOlderMessages,
    // Share
    shareToast,
    copyInviteLink,
  };
}
