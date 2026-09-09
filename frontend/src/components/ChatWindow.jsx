import { useEffect, useRef } from 'react';
import Message from './Message';
import SystemMessage from './SystemMessage';
import MessageInput from './MessageInput';
import OnlineCounter from './OnlineCounter';

export default function ChatWindow({
  connectionStatus,
  onlineCount,
  messages,
  selfId,
  selfSessionId,
  selfNickname,
  rateLimitError,
  onSend,
  maxMessageLength,
}) {
  const scrollRef = useRef(null);
  const wasNearBottomRef = useRef(true);

  // Track scroll position so we know if the user scrolled up to read history.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    wasNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Only auto-scroll if the user was already near the bottom.
  useEffect(() => {
    if (scrollRef.current && wasNearBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const isDisconnected = connectionStatus !== 'connected';
  const isConnecting = connectionStatus === 'connecting';

  return (
    <div className="chat-window">
      <header className="chat-header">
        <div className="chat-header-brand">
          <span className="brand-avatar" aria-hidden="true" />
          <h1>SpillTheTea</h1>
        </div>

        <div className="chat-header-meta">
          <OnlineCounter count={onlineCount} status={connectionStatus} />
          {selfId != null && (
            <span className="self-id-badge">
              <span className="self-id-label">YOU:</span>{' '}
              <strong>
                #{selfId}
                {selfNickname ? ` (${selfNickname})` : ''}
              </strong>
            </span>
          )}
        </div>
      </header>

      {isDisconnected && (
        <div className="connection-banner">
          {isConnecting
            ? 'Brewing the room…'
            : 'The kettle lost connection. Reconnecting…'}
        </div>
      )}

      <div className="chat-messages" ref={scrollRef} onScroll={handleScroll}>
        {messages.length === 0 && !isConnecting && (
          <div className="empty-state">
            <div className="empty-icon">☕</div>
            <div className="empty-title">The kettle is quiet…</div>
            <div className="empty-sub">Be the first to spill something.</div>
          </div>
        )}
        {messages.map((m, idx) =>
          m.type === 'system' ? (
            <SystemMessage key={m.id || idx} text={m.text} />
          ) : (
            <Message
              key={`${m.userId}-${m.createdAt}-${idx}`}
              userId={m.userId}
              nickname={m.nickname}
              message={m.message}
              createdAt={m.createdAt}
              isSelf={m.sessionId != null && m.sessionId === selfSessionId}
            />
          )
        )}
      </div>

      <MessageInput
        onSend={onSend}
        disabled={isDisconnected}
        maxLength={maxMessageLength}
        error={rateLimitError}
      />
    </div>
  );
}
