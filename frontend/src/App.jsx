import ChatWindow from './components/ChatWindow';
import { useChat } from './hooks/useChat';

export default function App() {
  const {
    connectionStatus,
    selfId,
    selfSessionId,
    selfNickname,
    onlineCount,
    messages,
    rateLimitError,
    sendMessage,
    maxMessageLength,
  } = useChat();

  return (
    <div className="app">
      <ChatWindow
        connectionStatus={connectionStatus}
        onlineCount={onlineCount}
        messages={messages}
        selfId={selfId}
        selfSessionId={selfSessionId}
        selfNickname={selfNickname}
        rateLimitError={rateLimitError}
        onSend={sendMessage}
        maxMessageLength={maxMessageLength}
      />
    </div>
  );
}
