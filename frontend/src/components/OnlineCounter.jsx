export default function OnlineCounter({ count, status }) {
  return (
    <div className="online-counter">
      <span className={`status-dot status-${status}`} />
      {status === 'connected' ? (
        <span className="online-label">
          <span className="online-count">{count}</span> brewing online
        </span>
      ) : (
        <span className="online-label">
          {status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
        </span>
      )}
    </div>
  );
}
