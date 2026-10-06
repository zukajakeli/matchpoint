// Serves index.html with page-specific <head> tags for blog posts, events
// and services, so crawlers and link previews (Facebook, Messenger, Viber,
// Google) see the real title, description and image without running JS.
// Browsers get the same SPA as before. Routed here by vercel.json.

import { blogPostSeo, eventSeo, productSeo, injectHead, pageSeo } from "../src/seo/seo.js";
import { selectOne, UUID } from "./_lib/supabase.js";

let template = null;

async function loadTemplate(request) {
  if (template) return template;
  const res = await fetch(new URL("/index.html", request.url));
  if (!res.ok) throw new Error(`index.html ${res.status}`);
  template = await res.text();
  return template;
}

// Public URL of each type (after the rewrite the function only sees /api/seo).
const PATHS = { blog: "/blog/", event: "/events/", product: "/services/" };

const LOADERS = {
  async blog(key) {
    const post = await selectOne(
      "blog_posts",
      `select=id,title,slug,excerpt,content,cover_image,author,published_at,created_at,updated_at&slug=eq.${encodeURIComponent(key)}&is_published=eq.true`
    );
    return post && blogPostSeo(post);
  },
  async event(key) {
    if (!UUID.test(key)) return null;
    const event = await selectOne(
      "events",
      `select=id,title,description,image,event_date,registration_deadline,entry_fee,updated_at&id=eq.${key}&is_active=eq.true`
    );
    return event && eventSeo(event);
  },
  async product(key) {
    if (!UUID.test(key)) return null;
    const product = await selectOne(
      "products",
      `select=id,title,subtitle,description,image,updated_at&id=eq.${key}&is_active=eq.true`
    );
    return product && productSeo(product);
  },
};

function html(body, status) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // CDN caches for 5 min, then serves stale while refreshing
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const key = params.get("key") || "";
  let page;
  try {
    page = await loadTemplate(request);
  } catch (error) {
    console.error("seo: could not load index.html:", error);
    return Response.redirect(new URL("/", request.url), 302);
  }

  try {
    const seo = LOADERS[type] ? await LOADERS[type](key) : null;
    if (!seo) {
      // The SPA still renders its own "not found"; crawlers get a 404.
      const path = PATHS[type] ? PATHS[type] + encodeURIComponent(key) : "/";
      return html(injectHead(page, pageSeo(null, null, path, { noindex: true })), 404);
    }
    return html(injectHead(page, seo), 200);
  } catch (error) {
    console.error(`seo: ${type} ${key}:`, error);
    return html(page, 200); // never break the page over metadata
  }
}
