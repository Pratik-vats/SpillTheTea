const mongoose = require('mongoose');

/**
 * A chat message. We intentionally store the absolute minimum:
 * a numeric anonymous user id, a session id for ownership, the text,
 * and a timestamp. No socket ids, no IP addresses, no persistent identity.
 */
const messageSchema = new mongoose.Schema(
  {
    userId: {
      type: Number,
      required: true,
      index: true,
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

// Newest-first index used when trimming / fetching recent history.
messageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
