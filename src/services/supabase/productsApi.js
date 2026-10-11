import { supabase, isSupabaseConfigured } from "../supabaseClient";
import { assertSupabase } from "./assertSupabase";

const PRODUCTS_SELECT = "id, title, subtitle, description, image, display_order, is_active, created_at, updated_at";

export async function fetchProducts(onlyActive = false) {
  assertSupabase();
  const run = (fields) => {
    let query = supabase.from("products").select(fields).order("display_order", { ascending: true });
    if (onlyActive) query = query.eq("is_active", true);
    return query;
  };
  let { data, error } = await run(`${PRODUCTS_SELECT}, show_on_home`);
  // show_on_home arrives with the 2026-10-11 migration; keep working without it.
  if (error && /show_on_home/.test(error.message || "")) ({ data, error } = await run(PRODUCTS_SELECT));
  if (error) throw error;
  return data || [];
}

export async function createProduct({ title, subtitle, description, image, display_order }) {
  assertSupabase();
  const { data, error } = await supabase
    .from("products")
    .insert({ title, subtitle, description, image, display_order: display_order || 0 })
    .select(PRODUCTS_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProduct(id, updates) {
  assertSupabase();
  const { data, error } = await supabase
    .from("products")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(PRODUCTS_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(id) {
  assertSupabase();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}
