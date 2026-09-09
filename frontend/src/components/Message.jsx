function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// A message reads as a "quote block" (greentext-style) when every
// non-empty line starts with "> " — mirrors how the room formats
// copy-pasted snippets/quotes.
function getQuoteLines(message) {
  const lines = message.split('\n');
  const meaningful = lines.filter((l) => l.trim().length > 0);
  if (meaningful.length === 0) return null;
  const allQuoted = meaningful.every((l) => l.trim().startsWith('>'));
  if (!allQuoted) return null;
  return lines.map((l) => l.replace(/^\s*>\s?/, ''));
}

export default function Message({ userId, nickname, message, createdAt, isSelf }) {
  const quoteLines = getQuoteLines(message);

  return (
    <div className={`message ${isSelf ? 'message-self' : ''}`}>
      <div className="message-meta">
        <span className="message-id-badge">
          #{userId} <span aria-hidden="true">·</span> {nickname || 'Anonymous'}
        </span>
        {isSelf && <span className="you-tag">YOU</span>}
        <span className="message-time">{formatTime(createdAt)}</span>
      </div>
      {/* Plain text only — never render message content as HTML. */}
      {quoteLines ? (
        <div className="message-quote-block">
          {quoteLines.map((line, i) => (
            <div className="message-quote-line" key={i}>
              {line.length ? `> ${line}` : '\u00A0'}
            </div>
          ))}
        </div>
      ) : (
        <div className="message-text">{message}</div>
      )}
    </div>
  );
}
