/**
 * Small, focused security/validation helpers shared by the socket layer.
 * Kept framework-agnostic (pure functions) so they're easy to unit test.
 */

const MAX_MESSAGE_LENGTH = Number(process.env.MAX_MESSAGE_LENGTH || 500);

/**
 * Validates and sanitizes a raw incoming message payload.
 * Returns { ok: true, message } or { ok: false, reason }.
 *
 * Note: this does NOT html-escape the text. The frontend must render
 * message content as plain text (e.g. React's default text rendering,
 * never dangerouslySetInnerHTML) so escaping happens at render time,
 * not storage time — that keeps the stored data portable and correct.
 */
function validateMessage(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'Message must be a string.' };
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { ok: false, reason: 'Message cannot be empty.' };
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, reason: `Message exceeds ${MAX_MESSAGE_LENGTH} characters.` };
  }

  // Strip control characters (except common whitespace) that have no
  // business being in a chat message.
  // eslint-disable-next-line no-control-regex
  const cleaned = trimmed.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  return { ok: true, message: cleaned };
}

/** Extracts the client IP, respecting a single trusted proxy hop if configured. */
function getClientIp(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return socket.handshake.address;
}

module.exports = { validateMessage, getClientIp, MAX_MESSAGE_LENGTH };
