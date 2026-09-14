import { useState } from 'react';

export default function CreateRoomModal({ isOpen, onClose, onCreateRoom }) {
  const [roomName, setRoomName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = roomName.trim();
    if (!trimmed) {
      setError('Room name is required.');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      await onCreateRoom({ name: trimmed, isPublic });
      setRoomName('');
      setIsPublic(true);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create room.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-container">
        <div className="modal-header">
          <h2>Create a Room</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <label className="modal-label" htmlFor="room-name-input">
              Room Name
            </label>
            <input
              id="room-name-input"
              type="text"
              className="modal-input"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value.slice(0, 40))}
              placeholder="e.g. Late Night Coding"
              maxLength={40}
              autoFocus
              disabled={isCreating}
            />
            <span className="modal-char-count">{roomName.length}/40</span>

            <div className="modal-toggle-group">
              <button
                type="button"
                className={`modal-toggle-btn ${isPublic ? 'modal-toggle-active' : ''}`}
                onClick={() => setIsPublic(true)}
                disabled={isCreating}
              >
                🌐 Public
              </button>
              <button
                type="button"
                className={`modal-toggle-btn ${!isPublic ? 'modal-toggle-active' : ''}`}
                onClick={() => setIsPublic(false)}
                disabled={isCreating}
              >
                🔒 Private
              </button>
            </div>

            <p className="modal-toggle-hint">
              {isPublic
                ? 'Anyone can see and join this room from the sidebar.'
                : 'Only people with the invite link can join.'}
            </p>

            {error && <div className="modal-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="modal-cancel-btn"
              onClick={onClose}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="modal-submit-btn"
              disabled={isCreating || !roomName.trim()}
            >
              {isCreating ? 'Creating…' : 'Create & Join'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
