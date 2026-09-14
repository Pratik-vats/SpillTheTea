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
              <span className="sidebar-room-icon" style={{ color: currentRoom === room.roomId ? 'var(--tea)' : 'var(--text-muted)' }}>
                #
              </span>
              <span className="sidebar-room-name" style={{ flex: 1, color: currentRoom === room.roomId ? 'var(--text)' : 'inherit' }}>{room.name}</span>
              <span className="sidebar-room-status" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {currentRoom === room.roomId ? (
                  <>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--online)' }} />
                    <span>live</span>
                  </>
                ) : (
                  <span>{room.activeUsers} brew</span>
                )}
              </span>
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
