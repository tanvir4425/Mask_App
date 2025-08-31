const { Schema, model, Types } = require("mongoose");

const ConversationSchema = new Schema(
  {
    isGroup: { type: Boolean, default: false },
    participants: [{ type: Types.ObjectId, ref: "User", index: true }],
    // For 1:1, stable key to avoid duplicates (sorted "a:b")
    participantsKey: { type: String, index: true, unique: true, sparse: true },
    lastMessageAt: { type: Date },
    lastMessage: {
      text: String,
      sender: { type: Types.ObjectId, ref: "User" },
      createdAt: Date,
    },
  },
  { timestamps: true }
);

module.exports = model("Conversation", ConversationSchema);
