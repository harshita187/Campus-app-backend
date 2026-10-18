require("./helpers"); // sets the env variables config/env.js needs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const EventEmitter = require("node:events");
const registerChatSocket = require("../sockets/chatSocket");

/**
 * A rejected promise inside a Socket.IO event handler is not caught by anyone,
 * and Node then crashes the whole server. This test calls every registered
 * handler with junk input and checks that none of them rejects. It also catches
 * a new handler that someone adds later without the safety wrapper.
 */
test("no socket handler rejects on junk input (a rejection would crash the server)", async (t) => {
  t.mock.method(console, "error", () => {}); // the wrapper logs the bad input; keep output clean

  const io = new EventEmitter();
  io.use = () => {};
  io.to = () => ({ emit() {} });
  registerChatSocket(io);

  const socket = new EventEmitter();
  socket.user = { id: "64b000000000000000000001" };
  socket.join = () => {};
  io.emit("connection", socket);

  const events = socket.eventNames();
  assert.ok(events.length >= 2, "expected the chat handlers to be registered");

  const junkInputs = [null, undefined, 42, "x", [], { conversationId: "bad", text: "hi" }, { text: 5 }];
  for (const event of events) {
    for (const payload of junkInputs) {
      await assert.doesNotReject(
        Promise.resolve(socket.listeners(event)[0](payload)),
        `${String(event)} rejected for ${JSON.stringify(payload)}`
      );
    }
  }
});
