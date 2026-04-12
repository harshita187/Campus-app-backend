const jwt = require("jsonwebtoken");
const env = require("../config/env");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

const registerChatSocket = (io) => {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));
    try {
      const decoded = jwt.verify(token, env.jwtSecret);
      socket.user = decoded;
      return next();
    } catch (_error) {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const uid = String(socket.user.id);
    socket.join(`user:${uid}`);

    socket.on("chat:joinConversation", async ({ conversationId }) => {
      if (!conversationId) return;
      const convo = await Conversation.findById(conversationId);
      if (!convo) return;
      const userId = String(socket.user.id);
      const isAllowed =
        String(convo.buyerId) === userId || String(convo.sellerId) === userId;
      if (!isAllowed) return;
      socket.join(`conversation:${conversationId}`);
    });

    socket.on("chat:sendMessage", async ({ conversationId, text }) => {
      if (!conversationId || !text || !text.trim()) return;
      const convo = await Conversation.findById(conversationId);
      if (!convo) return;
      const userId = String(socket.user.id);
      const isAllowed =
        String(convo.buyerId) === userId || String(convo.sellerId) === userId;
      if (!isAllowed) return;

      const message = await Message.create({
        conversationId,
        senderId: userId,
        text: text.trim(),
      });
      convo.lastMessageAt = new Date();
      await convo.save();

      const populatedMessage = await message.populate("senderId", "name email");
      io.to(`conversation:${conversationId}`).emit("chat:newMessage", populatedMessage);
      const senderStr = String(userId);
      const activity = { conversationId, senderId: senderStr };
      io.to(`user:${String(convo.buyerId)}`).emit("chat:activity", activity);
      io.to(`user:${String(convo.sellerId)}`).emit("chat:activity", activity);
    });
  });
};

module.exports = registerChatSocket;
