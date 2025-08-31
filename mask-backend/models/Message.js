const { Schema, model, Types } = require("mongoose");

const MessageSchema = new Schema(
  {
    conversation: { type: Types.ObjectId, ref: "Conversation", index: true },
    sender: { type: Types.ObjectId, ref: "User", index: true },
    text: { type: String, trim: true },
    readBy: [{ type: Types.ObjectId, ref: "User", index: true }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = model("Message", MessageSchema);
