const mongoose = require('mongoose');

/**
 * Room document.
 * The "global" room is seeded on first boot and has isPermanent = true.
 * User-created rooms are ephemeral — they are auto-deleted after being
 * empty for 1 hour.
 */
const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 40,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    isPermanent: {
      type: Boolean,
      default: false,
    },
    createdBySessionId: {
      type: String,
      default: null,
    },
    emptySince: {
      type: Date,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

module.exports = mongoose.model('Room', roomSchema);
