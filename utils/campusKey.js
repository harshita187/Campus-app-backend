/**
 * Lower-case, trimmed form of a campus name with single spaces, e.g.
 * "  MNIT   Jaipur " -> "mnit jaipur".
 * Listings store it as `campusKey`, so campus filters can use an exact match
 * (which can use an index) instead of a case-insensitive regex (which cannot).
 */
function toCampusKey(name) {
  return typeof name === "string" ? name.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

module.exports = toCampusKey;
