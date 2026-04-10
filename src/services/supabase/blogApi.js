import { supabase, isSupabaseConfigured } from "../supabaseClient";
import { assertSupabase } from "./assertSupabase";

const BLOG_SELECT = "id, title, slug, excerpt, content, cover_image, is_published, published_at, author, created_at, updated_at";

export async function fetchBlogPosts(onlyPublished = false) {
  assertSupabase();
  let query = supabase.from("blog_posts").select(BLOG_SELECT);
  if (onlyPublished) query = query.eq("is_published", true).order("published_at", { ascending: false });
  else query = query.order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchBlogPostBySlug(slug) {
  assertSupabase();
  const { data, error } = await supabase
    .from("blog_posts")
    .select(BLOG_SELECT)
    .eq("slug", slug)
    .eq("is_published", true)
    .single();
  if (error) throw error;
  return data;
}

export async function createBlogPost({ title, slug, excerpt, content, cover_image, is_published }) {
  assertSupabase();
  const payload = {
    title, slug, excerpt, content, cover_image,
    is_published: is_published || false,
    published_at: is_published ? new Date().toISOString() : null,
  };
  const { data, error } = await supabase.from("blog_posts").insert(payload).select(BLOG_SELECT).single();
  if (error) throw error;
  return data;
}

export async function updateBlogPost(id, updates) {
  assertSupabase();
  const payload = { ...updates, updated_at: new Date().toISOString() };
  if (updates.is_published && !updates.published_at) {
    payload.published_at = new Date().toISOString();
  }
  const { data, error } = await supabase.from("blog_posts").update(payload).eq("id", id).select(BLOG_SELECT).single();
  if (error) throw error;
  return data;
}

export async function deleteBlogPost(id) {
  assertSupabase();
  const { error } = await supabase.from("blog_posts").delete().eq("id", id);
  if (error) throw error;
}
