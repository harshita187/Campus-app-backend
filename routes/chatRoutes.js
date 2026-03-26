const express = require("express");
const verifyToken = require("../middleware/verifyToken");
const asyncHandler = require("../utils/asyncHandler");
const {
  createOrGetConversation,
  listConversations,
  listMessages,
  createMessage,
} = require("../controllers/chatController");

const router = express.Router();

router.use(verifyToken);

router.get("/conversations", asyncHandler(listConversations));
router.post("/conversations/product/:productId", asyncHandler(createOrGetConversation));
router.get("/conversations/:conversationId/messages", asyncHandler(listMessages));
router.post("/conversations/:conversationId/messages", asyncHandler(createMessage));

module.exports = router;
