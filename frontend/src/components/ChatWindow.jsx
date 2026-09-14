import { useEffect, useRef } from 'react';
import Message from './Message';
import SystemMessage from './SystemMessage';
import MessageInput from './MessageInput';
import OnlineCounter from './OnlineCounter';

export default function ChatWindow({
  connectionStatus,
  roomOnlineCount,
  messages,
  selfId,
  selfSessionId,
  selfNickname,
  rateLimitError,
  onSend,
  maxMessageLength,
  currentRoomInfo,
  hasMoreMessages,
  loadingOlder,
  onLoadMore,
  onCopyInviteLink,
  shareToast,
  onToggleSidebar,
}) {
  const scrollRef = useRef(null);
  const wasNearBottomRef = useRef(true);
  const prevScrollHeightRef = useRef(0);

  // Track scroll position so we know if the user scrolled up to read history.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;

    wasNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;

    // Trigger load older messages when scrolled near the top
    if (el.scrollTop < 60 && hasMoreMessages && !loadingOlder) {
      prevScrollHeightRef.current = el.scrollHeight;
      onLoadMore();
    }
  };

  // Only auto-scroll if the user was already near the bottom.
  useEffect(() => {
    if (scrollRef.current && wasNearBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Preserve scroll position when older messages are prepended
  useEffect(() => {
    if (scrollRef.current && prevScrollHeightRef.current > 0 && !loadingOlder) {
      const newScrollHeight = scrollRef.current.scrollHeight;
      const diff = newScrollHeight - prevScrollHeightRef.current;
      if (diff > 0) {
        scrollRef.current.scrollTop += diff;
      }
      prevScrollHeightRef.current = 0;
    }
  }, [messages, loadingOlder]);

  const isDisconnected = connectionStatus !== 'connected';
  const isConnecting = connectionStatus === 'connecting';

  const roomName = currentRoomInfo?.name || 'SpillTheTea';
  const isPermanent = currentRoomInfo?.isPermanent;
  const isPublic = currentRoomInfo?.isPublic;

  return (
    <div className="chat-window">
      <header className="chat-header">
        <div className="chat-header-left">
          <button
            className="header-hamburger"
            onClick={onToggleSidebar}
            aria-label="Open rooms sidebar"
            title="Rooms"
          >
            <span />
            <span />
            <span />
          </button>
          
          <div className="chat-header-brand-group">
            <div className="brand-titles">
              <span className="brand-main">
                Spill<span className="brand-main-tea">TheTea</span>
              </span>
            </div>
          </div>
          
          <div className="header-divider" />
          
          <div className="chat-header-room-info">
            <h1>
              {roomName}
              {currentRoomInfo && !isPermanent && (
                <span className="room-privacy-badge">
                  {isPublic ? '🌐' : '🔒'}
                </span>
              )}
            </h1>
            <OnlineCounter count={roomOnlineCount} status={connectionStatus} />
          </div>
        </div>

        <div className="chat-header-meta">
          {currentRoomInfo && !isPermanent && (
            <button className="share-link-btn" onClick={onCopyInviteLink} title="Copy invite link">
              🔗 Share
            </button>
          )}
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

      {/* Share toast notification */}
      {shareToast && (
        <div className="share-toast">
          ✅ Invite link copied to clipboard!
        </div>
      )}

      {isDisconnected && (
        <div className="connection-banner">
          {isConnecting
            ? 'Brewing the room…'
            : 'The kettle lost connection. Reconnecting…'}
        </div>
      )}

      <div className="chat-messages" ref={scrollRef} onScroll={handleScroll}>
        {/* Loading older messages indicator */}
        {loadingOlder && (
          <div className="loading-older">
            <span className="loading-older-spinner" />
            Loading earlier tea...
          </div>
        )}

        {/* "Load more" hint when there are older messages */}
        {hasMoreMessages && !loadingOlder && messages.length > 0 && (
          <div className="load-more-hint">
            ↑ Scroll up to load older messages
          </div>
        )}

        {messages.length === 0 && !isConnecting && (
          <div className="empty-state">
            <div className="empty-icon">☕</div>
            <div className="empty-title">The kettle is quiet…</div>
            <div className="empty-sub">
              {isPermanent
                ? 'Be the first to spill something.'
                : 'You\'re the first one here! Share your invite link to start chatting.'}
            </div>
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
