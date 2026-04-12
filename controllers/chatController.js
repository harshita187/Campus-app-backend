const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Product = require("../models/Product");
const ApiError = require("../utils/ApiError");

const isParticipant = (conversation, userId) =>
  String(conversation.buyerId) === String(userId) ||
  String(conversation.sellerId) === String(userId);

const ensureConversationAccess = async (conversationId, userId) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new ApiError(404, "Conversation not found");
  if (!isParticipant(conversation, userId)) throw new ApiError(403, "Not authorized");
  return conversation;
};

const createOrGetConversation = async (req, res) => {
  const { productId } = req.params;
  const buyerId = req.user.id;

  const product = await Product.findById(productId);
  if (!product) throw new ApiError(404, "Product not found");
  if (String(product.sellerId) === String(buyerId)) {
    throw new ApiError(400, "You cannot start chat on your own product");
  }

  const sellerId = product.sellerId;
  let conversation = await Conversation.findOne({ productId, buyerId, sellerId });

  if (!conversation) {
    conversation = await Conversation.create({ productId, buyerId, sellerId });
  }

  const populated = await conversation.populate([
    { path: "productId", select: "title images price" },
    { path: "buyerId", select: "name email" },
    { path: "sellerId", select: "name email" },
  ]);

  res.status(201).json(populated);
};

const listConversations = async (req, res) => {
  const userId = req.user.id;
  const conversations = await Conversation.find({
    $or: [{ buyerId: userId }, { sellerId: userId }],
  })
    .sort({ lastMessageAt: -1 })
    .populate("productId", "title images price")
    .populate("buyerId", "name email")
    .populate("sellerId", "name email");

  res.json(conversations);
};

const listMessages = async (req, res) => {
  const conversation = await ensureConversationAccess(req.params.conversationId, req.user.id);
  const messages = await Message.find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .populate("senderId", "name email");

  res.json(messages);
};

const createMessage = async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) throw new ApiError(400, "Message text is required");

  const conversation = await ensureConversationAccess(req.params.conversationId, req.user.id);

  const message = await Message.create({
    conversationId: conversation._id,
    senderId: req.user.id,
    text: text.trim(),
  });

  conversation.lastMessageAt = new Date();
  await conversation.save();

  const populatedMessage = await message.populate("senderId", "name email");

  const io = req.app.get("io");
  if (io) {
    const cid = String(conversation._id);
    io.to(`conversation:${cid}`).emit("chat:newMessage", populatedMessage);
    const senderStr = String(req.user.id);
    const buyerStr = String(conversation.buyerId);
    const sellerStr = String(conversation.sellerId);
    const activity = { conversationId: conversation._id, senderId: senderStr };
    io.to(`user:${buyerStr}`).emit("chat:activity", activity);
    io.to(`user:${sellerStr}`).emit("chat:activity", activity);
  }

  res.status(201).json(populatedMessage);
};

module.exports = {
  createOrGetConversation,
  listConversations,
  listMessages,
  createMessage,
};
