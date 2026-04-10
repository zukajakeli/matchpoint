import { supabase, isSupabaseConfigured } from "../supabaseClient";
import { assertSupabase } from "./assertSupabase";

const PRODUCTS_SELECT = "id, title, subtitle, description, image, display_order, is_active, created_at, updated_at";

export async function fetchProducts(onlyActive = false) {
  assertSupabase();
  let query = supabase.from("products").select(PRODUCTS_SELECT).order("display_order", { ascending: true });
  if (onlyActive) query = query.eq("is_active", true);
  const { data, error } = await query;
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
