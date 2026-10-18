const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
const env = require("./config/env");
const corsOptions = require("./config/cors");
const errorHandler = require("./middleware/errorHandler");
const registerChatSocket = require("./sockets/chatSocket");

/**
 * Builds the Express app, the HTTP server and Socket.IO, but does not connect
 * to MongoDB or start listening. index.js does that for production, and the
 * tests import this file to run requests against an in-memory database.
 */
function createApp() {
  const app = express();
  // Behind Cloud Run, the TCP connection comes from Google's front end. With the
  // right hop count, req.ip is the real client, so rate limits count per user.
  app.set("trust proxy", env.trustProxy);

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: corsOptions.origin,
      credentials: true,
    },
  });
  registerChatSocket(io);
  app.set("io", io);

  // Allow marketplace images on :3000 to load files served from this API (:5001).
  // Helmet's default CORP is "same-origin", which blocks cross-origin <img> usage.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(cookieParser());

  // Only failed logins count, per IP + email: a whole campus can share one IP,
  // so a shared limit on every /auth route let one person lock everyone out.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${req.ip}|${String(req.body?.email ?? "").trim().toLowerCase()}`,
  });
  const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const authRoutes = require("./routes/authRoutes");
  const productRoutes = require("./routes/productRoutes");
  const uploadRoutes = require("./routes/uploadRoutes");
  const chatRoutes = require("./routes/chatRoutes");
  app.post("/api/auth/login", loginLimiter);
  app.post("/api/auth/signup", signupLimiter);
  app.use("/api/auth", authRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/uploads", uploadRoutes);
  /** Some hosts (e.g. Cloud Run behind path rewrites) call POST /uploads/images without /api. */
  app.use("/uploads", uploadRoutes);
  app.use(
    "/uploads",
    express.static(env.uploadDir, {
      setHeaders(res) {
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        // Uploaded files are only ever images. If someone opens one directly as
        // a page, this header forbids scripts and any other active content.
        res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      },
    })
  );
  app.use("/api/chat", chatRoutes);

  app.get("/", (req, res) => {
    res.json({ message: "Campus App Backend is alive" });
  });

  app.use(errorHandler);

  return { app, server, io };
}

module.exports = createApp;
