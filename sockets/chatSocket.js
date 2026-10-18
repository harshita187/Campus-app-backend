const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const ApiError = require("../utils/ApiError");
const { verifyAccessToken } = require("../utils/authTokens");

const MAX_MESSAGE_LENGTH = 1000; // same limit as the Message model

/**
 * Wraps an async socket event handler so a thrown error (for example a bad id)
 * is logged instead of becoming an unhandled promise rejection, which would
 * crash the whole Node process.
 */
const safeHandler = (eventName, handler) => async (...args) => {
  try {
    await handler(...args);
  } catch (error) {
    console.error(`Socket handler "${eventName}" failed:`, error.message);
  }
};

/** Loads the conversation only if the id is valid and the user is the buyer or seller. */
async function findConversationForUser(conversationId, userId) {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) return null;
  const convo = await Conversation.findById(conversationId);
  if (!convo) return null;
  const isParticipant =
    String(convo.buyerId) === userId || String(convo.sellerId) === userId;
  return isParticipant ? convo : null;
}

const registerChatSocket = (io) => {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));
    try {
      socket.user = await verifyAccessToken(token);
      return next();
    } catch (error) {
      // A bad or revoked token is final. Anything else (for example the database
      // being briefly unreachable) gets an error the client may retry.
      if (error instanceof ApiError && error.statusCode === 401) {
        return next(new Error("Unauthorized"));
      }
      const retryable = new Error("Temporarily unavailable");
      retryable.data = { retry: true };
      return next(retryable);
    }
  });

  io.on("connection", (socket) => {
    const uid = String(socket.user.id);
    socket.join(`user:${uid}`);

    socket.on(
      "chat:joinConversation",
      safeHandler("chat:joinConversation", async ({ conversationId } = {}) => {
        const convo = await findConversationForUser(conversationId, uid);
        if (!convo) return;
        socket.join(`conversation:${conversationId}`);
      })
    );

    socket.on(
      "chat:sendMessage",
      safeHandler("chat:sendMessage", async ({ conversationId, text } = {}) => {
        if (typeof text !== "string" || !text.trim()) return;
        if (text.trim().length > MAX_MESSAGE_LENGTH) return;
        const convo = await findConversationForUser(conversationId, uid);
        if (!convo) return;

        const message = await Message.create({
          conversationId,
          senderId: uid,
          text: text.trim(),
        });
        convo.lastMessageAt = new Date();
        await convo.save();

        const populatedMessage = await message.populate("senderId", "name email");
        io.to(`conversation:${conversationId}`).emit("chat:newMessage", populatedMessage);
        const activity = { conversationId, senderId: uid };
        io.to(`user:${String(convo.buyerId)}`).emit("chat:activity", activity);
        io.to(`user:${String(convo.sellerId)}`).emit("chat:activity", activity);
      })
    );
  });
};

module.exports = registerChatSocket;
