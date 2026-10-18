const mongoose = require("mongoose");

/**
 * A cursor marks where the last page ended: the last listing's createdAt and _id,
 * packed into one opaque, URL-safe string. The client sends it back to get the
 * next page, so the server never has to skip over earlier rows.
 */
function encodeCursor(doc) {
  const createdAt = new Date(doc.createdAt).toISOString();
  return Buffer.from(`${createdAt}|${doc._id}`, "utf8").toString("base64url");
}

/** Returns { createdAt, id } or null when the cursor is not one we created. */
function decodeCursor(cursor) {
  let raw;
  try {
    raw = Buffer.from(String(cursor), "base64url").toString("utf8");
  } catch {
    return null;
  }
  const [iso, id] = raw.split("|");
  const createdAt = new Date(iso);
  if (!iso || Number.isNaN(createdAt.getTime())) return null;
  if (!/^[a-f0-9]{24}$/i.test(id || "")) return null;
  return { createdAt, id: new mongoose.Types.ObjectId(id) };
}

module.exports = { encodeCursor, decodeCursor };
