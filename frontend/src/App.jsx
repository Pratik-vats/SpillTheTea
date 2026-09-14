import { useState } from 'react';
import ChatWindow from './components/ChatWindow';
import Sidebar from './components/Sidebar';
import CreateRoomModal from './components/CreateRoomModal';
import { useChat } from './hooks/useChat';

export default function App() {
  const {
    connectionStatus,
    selfId,
    selfSessionId,
    selfNickname,
    messages,
    rateLimitError,
    sendMessage,
    maxMessageLength,
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
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  return (
    <div className="app">
      <div className="app-layout">
        <Sidebar
          publicRooms={publicRooms}
          currentRoom={currentRoom}
          onJoinRoom={joinRoom}
          onOpenCreateModal={() => {
            setCreateModalOpen(true);
            setSidebarOpen(false);
          }}
          isOpen={sidebarOpen}
          onToggle={toggleSidebar}
        />

        <ChatWindow
          connectionStatus={connectionStatus}
          roomOnlineCount={roomOnlineCount}
          messages={messages}
          selfId={selfId}
          selfSessionId={selfSessionId}
          selfNickname={selfNickname}
          rateLimitError={rateLimitError}
          onSend={sendMessage}
          maxMessageLength={maxMessageLength}
          currentRoomInfo={currentRoomInfo}
          hasMoreMessages={hasMoreMessages}
          loadingOlder={loadingOlder}
          onLoadMore={loadOlderMessages}
          onCopyInviteLink={copyInviteLink}
          shareToast={shareToast}
          onToggleSidebar={toggleSidebar}
        />
      </div>

      <CreateRoomModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreateRoom={createRoom}
      />
    </div>
  );
}
