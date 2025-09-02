// mask-backend/models/Message.js
const { Schema, model, Types } = require("mongoose");

const EncryptedSchema = new Schema(
  {
    ct: { type: String },   // ciphertext (base64)
    iv: { type: String },   // initialization vector (base64)
    tag: { type: String },  // auth tag (base64)
  },
  { _id: false }
);

const MessageSchema = new Schema(
  {
    conversation: { type: Types.ObjectId, ref: "Conversation", index: true },
    sender:       { type: Types.ObjectId, ref: "User", index: true },

    /**
     * NOTE:
     *  - New messages use `encrypted` only (no plaintext saved).
     *  - `text` remains for backwards compatibility so old rows still read.
     */
    text: { type: String, trim: true, select: true, default: undefined },
    encrypted: { type: EncryptedSchema, default: null },

    readBy: [{ type: Types.ObjectId, ref: "User", index: true }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = model("Message", MessageSchema);
