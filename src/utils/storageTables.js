import { TABLE_COUNT } from "../config";
import { loadGameRates } from "./gameRates";

const PING_PONG_COUNT = 10;
const FOOSBALL_ID = 11;
const AIR_HOCKEY_ID = 12;
const PLAYSTATION_ID = 13;
const CUSTOM_ID = 14;

const SPECIAL_DEFAULTS = {
  [FOOSBALL_ID]: { name: "Foosball", gameType: "foosball", hourlyRate: null },
  [AIR_HOCKEY_ID]: { name: "Air hockey", gameType: "airhockey", hourlyRate: null },
  [PLAYSTATION_ID]: { name: "PlayStation", gameType: "playstation", hourlyRate: null },
  [CUSTOM_ID]: { name: "Blank Timer", gameType: "custom", hourlyRate: null },
};

function getDefaultTableById(id) {
  const special = SPECIAL_DEFAULTS[id] || { name: `Table ${id}`, gameType: "pingpong" };
  const hourlyRate =
    special.gameType === "playstation" ? loadGameRates().playstation : special.hourlyRate;
  return {
    id,
    name: special.name,
    timerStartTime: null,
    elapsedTimeInSeconds: 0,
    isRunning: false,
    timerMode: "standard",
    initialCountdownSeconds: null,
    isAvailable: true,
    sessionStartTime: null,
    sessionEndTime: null,
    fitPass: false,
    gameType: special.gameType,
    hourlyRate: hourlyRate ?? null,
  };
}

const LEGACY_GAMETYPE_TO_NEW_ID = {
  foosball: FOOSBALL_ID,
  airhockey: AIR_HOCKEY_ID,
  playstation: PLAYSTATION_ID,
  custom: CUSTOM_ID,
};

// Migrates old localStorage shape where specials lived at ids 9-12
// (8 ping-pong + 4 specials) to the new shape where specials live at 11-14
// and ping-pong occupies 1-10.
function remapLegacySpecialIds(parsedTables) {
  if (!Array.isArray(parsedTables)) return parsedTables;
  const hasLegacy = parsedTables.some(
    (t) =>
      t &&
      typeof t.id === "number" &&
      t.id >= 9 && t.id <= 12 &&
      t.gameType &&
      t.gameType !== "pingpong" &&
      LEGACY_GAMETYPE_TO_NEW_ID[t.gameType] &&
      LEGACY_GAMETYPE_TO_NEW_ID[t.gameType] !== t.id
  );
  if (!hasLegacy) return parsedTables;
  return parsedTables.map((t) => {
    if (!t) return t;
    const targetId = t.gameType ? LEGACY_GAMETYPE_TO_NEW_ID[t.gameType] : undefined;
    if (targetId && t.id !== targetId && t.gameType !== "pingpong") {
      return { ...t, id: targetId };
    }
    return t;
  });
}

function normalizeStoredTables(parsedTables) {
  return parsedTables.map((table, index) => ({
    id: table.id || index + 1,
    name: table.name || `Table ${table.id || index + 1}`,
    isAvailable: typeof table.isAvailable === "boolean" ? table.isAvailable : true,
    timerStartTime:
      table.isRunning && table.timerStartTime ? table.timerStartTime : null,
    elapsedTimeInSeconds:
      typeof table.elapsedTimeInSeconds === "number" ? table.elapsedTimeInSeconds : 0,
    isRunning: typeof table.isRunning === "boolean" ? table.isRunning : false,
    timerMode: table.timerMode || "standard",
    initialCountdownSeconds:
      typeof table.initialCountdownSeconds === "number"
        ? table.initialCountdownSeconds
        : null,
    sessionStartTime:
      typeof table.sessionStartTime === "number" ? table.sessionStartTime : null,
    sessionEndTime:
      typeof table.sessionEndTime === "number" ? table.sessionEndTime : null,
    fitPass: typeof table.fitPass === "boolean" ? table.fitPass : false,
    gameType: table.gameType || "pingpong",
    hourlyRate: typeof table.hourlyRate === "number" ? table.hourlyRate : null,
    memberId: table.memberId ?? null,
    memberName: table.memberName ?? null,
    memberSessionId: table.memberSessionId ?? null,
  }));
}

// Fills in any MISSING ids in [1..TABLE_COUNT] with sensible defaults.
// Looking at id presence (not array length) prevents duplicates and
// recovers tables that were dropped by an earlier broken slice/migration.
function ensureTableCountWithDefaults(normalized) {
  const byId = new Map();
  normalized.forEach((t) => {
    if (t && typeof t.id === "number" && !byId.has(t.id)) {
      byId.set(t.id, t);
    }
  });
  for (let id = 1; id <= TABLE_COUNT; id++) {
    if (!byId.has(id)) {
      byId.set(id, getDefaultTableById(id));
    }
  }
  return Array.from(byId.values());
}

function enforceGameTableOrder(normalized) {
  const pingpong = normalized
    .filter((t) => t.gameType === "pingpong")
    .sort((a, b) => a.id - b.id)
    .slice(0, PING_PONG_COUNT);
  const foos = normalized.find((t) => t.gameType === "foosball");
  const hockey = normalized.find((t) => t.gameType === "airhockey");
  const playstation = normalized.find((t) => t.gameType === "playstation");
  const custom = normalized.find((t) => t.gameType === "custom");

  const rebuilt = [...pingpong];
  if (foos) rebuilt.push(foos);
  if (hockey) rebuilt.push(hockey);
  if (playstation) rebuilt.push(playstation);
  if (custom) rebuilt.push(custom);

  if (!foos && rebuilt.length < TABLE_COUNT) {
    rebuilt.push(getDefaultTableById(FOOSBALL_ID));
  }
  if (!hockey && rebuilt.length < TABLE_COUNT) {
    rebuilt.push(getDefaultTableById(AIR_HOCKEY_ID));
  }
  if (!playstation && rebuilt.length < TABLE_COUNT) {
    rebuilt.push(getDefaultTableById(PLAYSTATION_ID));
  }
  if (!custom && rebuilt.length < TABLE_COUNT) {
    rebuilt.push(getDefaultTableById(CUSTOM_ID));
  }

  return rebuilt.slice(0, TABLE_COUNT);
}

export function buildInitialDefaultTables() {
  return Array.from({ length: TABLE_COUNT }, (_, i) => getDefaultTableById(i + 1));
}

export function buildTablesFromStorage(parsedTables) {
  const remapped = remapLegacySpecialIds(parsedTables);
  const normalized = normalizeStoredTables(remapped);
  const expanded = ensureTableCountWithDefaults(normalized);
  return enforceGameTableOrder(expanded);
}
