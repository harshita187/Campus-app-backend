const mongoose = require("mongoose");
const env = require("./config/env");
const createApp = require("./app");
const { runStartupMigrations } = require("./migrations");

const { server, io } = createApp();

/**
 * Connect, fix data, and only then open the port. Campus filters depend on the
 * campusKey backfill, so serving requests before it finished could return
 * empty results. On Cloud Run, traffic arrives only once the port is open.
 */
async function start() {
  await mongoose.connect(env.mongoUri);
  console.log("MongoDB connected");
  await runStartupMigrations();
  server.listen(env.port, "0.0.0.0", () => {
    console.log(`Backend server running on port ${env.port}`);
    console.log("Press Ctrl+C in this terminal to stop (not the arrow keys).");
  });
}

start().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`\n${signal} received — closing server…`);
  io.disconnectSockets(true);
  server.close(async () => {
    try {
      await mongoose.connection.close();
    } catch (_e) {
      /* ignore */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
