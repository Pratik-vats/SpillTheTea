export default function Sidebar({
  publicRooms,
  currentRoom,
  onJoinRoom,
  onOpenCreateModal,
  isOpen,
  onToggle,
}) {
  const current = publicRooms.find((room) => room.roomId === currentRoom);

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onToggle} />}

      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <div>
            <span className="sidebar-kicker">Now spilling in</span>
            <span className="sidebar-title">{current?.name || 'Rooms'}</span>
          </div>
          <button className="sidebar-close-btn" onClick={onToggle} aria-label="Close sidebar">
            ✕
          </button>
        </div>

        <div className="sidebar-rooms">
          {publicRooms.map((room) => (
            <button
              key={room.roomId}
              className={`sidebar-room-item ${
                currentRoom === room.roomId ? 'sidebar-room-active' : ''
              }`}
              onClick={() => {
                onJoinRoom(room.roomId);
                onToggle();
              }}
            >
              <span className="sidebar-room-icon">
                {room.isPermanent ? '🌐' : room.isPublic !== false ? '💬' : '🔒'}
              </span>
              <span className="sidebar-room-info">
                <span className="sidebar-room-name">{room.name}</span>
                <span className="sidebar-room-count">
                  {room.activeUsers} {room.activeUsers === 1 ? 'user' : 'users'}
                </span>
              </span>
              {currentRoom === room.roomId && (
                <span className="sidebar-room-active-dot" />
              )}
            </button>
          ))}

          {publicRooms.length <= 1 && (
            <div className="sidebar-empty-hint">
              No public rooms yet. Create one!
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <button className="sidebar-create-btn" onClick={onOpenCreateModal}>
            <span className="sidebar-create-icon">+</span>
            <span>New Room</span>
          </button>
        </div>
      </aside>
    </>
  );
}
