import { useRef, useState } from 'react';

export default function MessageInput({ onSend, disabled, maxLength, error }) {
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleChange = (e) => {
    setValue(e.target.value.slice(0, maxLength));
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <form className="message-input" onSubmit={handleSubmit}>
      {error && <div className="rate-limit-banner">{error}</div>}
      <div className={`message-input-row ${disabled ? 'is-disabled' : ''}`}>
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="🍵 Spill something…"
          disabled={disabled}
          maxLength={maxLength}
          aria-label="Message"
        />
        <span
          className={`char-counter ${value.length > maxLength * 0.95 ? 'is-near-limit' : ''}`}
        >
          {value.length}/{maxLength}
        </span>
        <button
          type="submit"
          className="send-btn"
          disabled={disabled || !value.trim()}
          aria-label="Send message"
        >
          <span className="send-label">Send</span>
          <span className="send-arrow" aria-hidden="true">➤</span>
        </button>
      </div>
      <div className="input-footer">
        <span className="input-hint">
          <kbd>Enter</kbd> to send
        </span>
        <span className="input-hint">
          <kbd>Shift+Enter</kbd> new line
        </span>
      </div>
    </form>
  );
}
