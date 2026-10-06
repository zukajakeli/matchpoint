// /sitemap.xml — public pages plus every published post, active event and
// active service, so new content is discovered without manual work.

import { SITE, escapeHtml } from "../src/seo/seo.js";
import { selectRows } from "./_lib/supabase.js";

const STATIC_PAGES = ["/", "/book", "/events", "/blog", "/contact", "/terms", "/privacy", "/refunds", "/payments"];

function entry(path, lastmod) {
  return `  <url><loc>${escapeHtml(SITE.url + path)}</loc>${
    lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : ""
  }</url>`;
}

export async function GET() {
  const urls = STATIC_PAGES.map((p) => entry(p));
  try {
    const [posts, events, products] = await Promise.all([
      selectRows("blog_posts", "select=slug,updated_at,published_at&is_published=eq.true&order=published_at.desc"),
      selectRows("events", "select=id,updated_at&is_active=eq.true&order=event_date.desc"),
      selectRows("products", "select=id,updated_at&is_active=eq.true&order=display_order"),
    ]);
    posts.forEach((p) => urls.push(entry(`/blog/${encodeURIComponent(p.slug)}`, p.updated_at || p.published_at)));
    events.forEach((e) => urls.push(entry(`/events/${e.id}`, e.updated_at)));
    products.forEach((p) => urls.push(entry(`/services/${p.id}`, p.updated_at)));
  } catch (error) {
    console.error("sitemap:", error);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
