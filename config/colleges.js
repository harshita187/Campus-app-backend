/**
 * Supported campuses — expand anytime. IDs are stable URL/query slugs.
 * nearby: other colleges shown when user picks "My campus + nearby".
 */
const COLLEGES = [
  { id: "mnit_jaipur", name: "MNIT Jaipur", city: "Jaipur" },
  { id: "lnmiit_jaipur", name: "LNMIIT Jaipur", city: "Jaipur" },
  { id: "bits_pilani", name: "BITS Pilani", city: "Pilani" },
  { id: "iit_bombay", name: "IIT Bombay", city: "Mumbai" },
  { id: "nit_trichy", name: "NIT Trichy", city: "Tiruchirappalli" },
  { id: "iiit_hyderabad", name: "IIIT Hyderabad", city: "Hyderabad" },
  { id: "iit_delhi", name: "IIT Delhi", city: "New Delhi" },
  { id: "nit_warangal", name: "NIT Warangal", city: "Warangal" },
];

const NEARBY_BY_COLLEGE = {
  mnit_jaipur: ["lnmiit_jaipur", "bits_pilani"],
  lnmiit_jaipur: ["mnit_jaipur"],
  bits_pilani: ["mnit_jaipur", "lnmiit_jaipur"],
  iit_bombay: ["nit_trichy"],
  nit_trichy: ["iit_bombay"],
  iiit_hyderabad: ["nit_warangal"],
  nit_warangal: ["iiit_hyderabad"],
  iit_delhi: [],
};

const COLLEGE_IDS = COLLEGES.map((c) => c.id);
const DEFAULT_COLLEGE_ID = "mnit_jaipur";

function isValidCollegeId(id) {
  return typeof id === "string" && COLLEGE_IDS.includes(id.trim());
}

/** Returns slug or empty string (no silent default to one institute). */
function normalizeCollegeId(id) {
  if (!id || typeof id !== "string") return "";
  const t = id.trim();
  return isValidCollegeId(t) ? t : "";
}

function getCollegeLabel(id) {
  if (!id || typeof id !== "string") return "";
  const row = COLLEGES.find((c) => c.id === id.trim());
  return row ? row.name : "";
}

function getNearbyCollegeIds(collegeId) {
  const cid = normalizeCollegeId(collegeId);
  return NEARBY_BY_COLLEGE[cid] || [];
}

function listCollegesPayload() {
  return {
    colleges: COLLEGES.map((c) => ({
      id: c.id,
      name: c.name,
      city: c.city,
    })),
    defaultCollegeId: DEFAULT_COLLEGE_ID,
  };
}

module.exports = {
  COLLEGES,
  COLLEGE_IDS,
  DEFAULT_COLLEGE_ID,
  isValidCollegeId,
  normalizeCollegeId,
  getCollegeLabel,
  getNearbyCollegeIds,
  listCollegesPayload,
};
