// Read-only Supabase REST access for the SEO functions. Uses the public
// (anon) key, so row-level security limits it to published content.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export async function selectRows(table, query) {
  if (!SUPABASE_URL || !ANON_KEY) throw new Error("Supabase env vars are not set");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${table} ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function selectOne(table, query) {
  const rows = await selectRows(table, `${query}&limit=1`);
  return rows[0] || null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
