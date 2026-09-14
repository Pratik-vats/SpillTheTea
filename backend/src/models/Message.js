const mongoose = require('mongoose');

/**
 * A chat message. We intentionally store the absolute minimum:
 * a numeric anonymous user id, a session id for ownership, the text,
 * a room association, and a timestamp.
 * No socket ids, no IP addresses, no persistent identity.
 */
const messageSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      default: 'global',
    },
    userId: {
      type: Number,
      required: true,
    },
    sessionId: {
      type: String,
      required: true,
    },
    nickname: {
      type: String,
      required: false,
      maxlength: 32,
    },
    message: {
      type: String,
      required: true,
      maxlength: 500,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  }
);

// Primary query pattern: fetch room messages sorted by time (pagination + trimming).
messageSchema.index({ roomId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
