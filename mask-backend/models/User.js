// mask-backend/models/User.js
const mongoose = require("mongoose");

const BookmarkSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Small sub-schema for past avatars
const AvatarHistorySchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/** --- NEW: privacy-friendly motivation preferences (opt-in) --- */
const MotivationPrefsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },          // user must opt in
    hourLocal: { type: Number, min: 0, max: 23, default: 9 }, // preferred local hour (0..23)

    tone: {
      inspiration: { type: Boolean, default: true },
      humor: { type: Boolean, default: false },
    },

    // Curated, non-sensitive tags; sanitized in routes
    interests: { type: [String], default: [] },
    goals: { type: [String], default: [] },

    // Lightweight role & optional language code (e.g., "en")
    role: { type: String, default: "" },
    language: { type: String, default: "" },

    updatedAt: { type: Date },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema({
  // Identity
  pseudonym: { type: String, required: true, trim: true, unique: true },
  email: { type: String, trim: true, lowercase: true, sparse: true, unique: true },

  // IMPORTANT: password exists and is persisted; hidden by default in queries
  password: { type: String, required: true, select: false },

  // Profile
  avatarURL: { type: String, default: "" },        // current avatar URL (served from /uploads/avatars/...)
  avatarUpdatedAt: { type: Date, default: null },  // last time the avatar was set/changed/deleted (for cooldown)
  avatarHistory: { type: [AvatarHistorySchema], default: [] }, // recent previous avatars

  // Memberships
  pages: [{ type: mongoose.Schema.Types.ObjectId, ref: "Page", default: [] }],
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group", default: [] }],

  // Social graph
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
  followersCount: { type: Number, default: 0 },

  // Bookmarks
  bookmarks: { type: [BookmarkSchema], default: [] },

  // Admin & safety
  role: { type: String, enum: ["user", "moderator", "admin"], default: "user" },
  deletedAt: { type: Date, default: null },


  // Inside UserSchema definition:
emailVerified: { type: Boolean, default: false },



  // --- NEW: motivation preferences (opt-in; safe defaults) ---
  motivationPrefs: { type: MotivationPrefsSchema, default: () => ({}) },

  // Meta
  createdAt: { type: Date, default: Date.now },
});

// Enforce uniqueness + single-admin at the DB level
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ pseudonym: 1 }, { unique: true });

// Only ONE document with role === 'admin'
UserSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: "admin" } });


// Return existing compiled model if it’s already registered
module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
