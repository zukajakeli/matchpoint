// Website content managed from /superadmin/website: hero slides, gallery
// images and editable page text (site_content). Public pages read only
// active rows; RLS lets the superadmin write.

import { supabase } from "../supabaseClient";
import { assertSupabase } from "./assertSupabase";

const SLIDE_FIELDS =
  "id, kind, title_ka, title_en, subtitle_ka, subtitle_en, cta_ka, cta_en, link_url, image_alt, image_position, display_order, is_active, updated_at";
const GALLERY_FIELDS = "id, alt_ka, alt_en, display_order, is_active, updated_at";

// Public lists skip the image column (base64 can be large); images load
// from /api/image. The admin asks for them to show previews.
export async function fetchHeroSlides({ includeInactive = false, withImages = false } = {}) {
  assertSupabase();
  let query = supabase
    .from("hero_slides")
    .select(withImages ? `${SLIDE_FIELDS}, image` : SLIDE_FIELDS)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function saveHeroSlide(id, fields) {
  assertSupabase();
  const payload = { ...fields, updated_at: new Date().toISOString() };
  const query = id
    ? supabase.from("hero_slides").update(payload).eq("id", id)
    : supabase.from("hero_slides").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteHeroSlide(id) {
  assertSupabase();
  const { error } = await supabase.from("hero_slides").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchGalleryImages({ includeInactive = false, withImages = false } = {}) {
  assertSupabase();
  let query = supabase
    .from("gallery_images")
    .select(withImages ? `${GALLERY_FIELDS}, image` : GALLERY_FIELDS)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function addGalleryImages(rows) {
  assertSupabase();
  const { error } = await supabase.from("gallery_images").insert(rows);
  if (error) throw error;
}

export async function updateGalleryImage(id, fields) {
  assertSupabase();
  const { error } = await supabase
    .from("gallery_images")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteGalleryImage(id) {
  assertSupabase();
  const { error } = await supabase.from("gallery_images").delete().eq("id", id);
  if (error) throw error;
}

// Write a new display_order for every row of a table, in list order.
// Only touches display_order, so updated_at (and the image URL) stays.
export async function saveOrder(table, ids) {
  assertSupabase();
  const results = await Promise.all(
    ids.map((id, index) => supabase.from(table).update({ display_order: index }).eq("id", id))
  );
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
}

export async function fetchSiteContent(keys) {
  assertSupabase();
  const { data, error } = await supabase.from("site_content").select("key, value").in("key", keys);
  if (error) throw error;
  return Object.fromEntries((data || []).map((row) => [row.key, row.value]));
}

export async function saveSiteContent(key, value) {
  assertSupabase();
  const { error } = await supabase
    .from("site_content")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

export async function fetchCorporateInquiries() {
  assertSupabase();
  const { data, error } = await supabase
    .from("corporate_inquiries")
    .select("id, full_name, company, email, phone, event_date, participants, message, email_sent_at, email_error, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

export async function deleteCorporateInquiry(id) {
  assertSupabase();
  const { error } = await supabase.from("corporate_inquiries").delete().eq("id", id);
  if (error) throw error;
}
