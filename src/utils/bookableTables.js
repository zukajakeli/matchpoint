// Tables that can be booked, by game. Must match public.bookable_table_ids()
// in supabase/schema.sql — the database assigns online bookings from it.

export const BOOKABLE_TABLES = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => ({
    id,
    label: `T${id}`,
    name: `Table ${id}`,
    gameType: "pingpong",
  })),
  { id: 11, label: "Foos", name: "Foosball", gameType: "foosball" },
  { id: 12, label: "Air", name: "Air hockey", gameType: "airhockey" },
  { id: 13, label: "PS", name: "PlayStation", gameType: "playstation" },
];

export const BOOKABLE_TABLE_IDS = BOOKABLE_TABLES.map((t) => t.id);

const TABLE_BY_ID = new Map(BOOKABLE_TABLES.map((t) => [t.id, t]));

export function getBookableTable(id) {
  return TABLE_BY_ID.get(Number(id)) || null;
}

export function tableLabel(id) {
  return getBookableTable(id)?.label || `T${id}`;
}

// Game type implied by a set of tables: a special game when every table is
// that game's, otherwise ping-pong.
export function gameTypeForTables(tableIds) {
  const types = new Set((tableIds || []).map((id) => getBookableTable(id)?.gameType).filter(Boolean));
  return types.size === 1 ? [...types][0] : "pingpong";
}
