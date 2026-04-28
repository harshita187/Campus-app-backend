/** Escape string for safe use inside RegExp constructor. */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = escapeRegex;
