// SEO metadata shared by the browser (<Seo>) and the Vercel functions that
// pre-render <head> for crawlers (api/seo.js, api/sitemap.js). Facebook,
// Messenger, Viber etc. don't run JavaScript, so link previews only work if
// these tags are already in the HTML the server sends.
//
// Pure functions only: no window/document/process at import time.

export const SITE = {
  url: "https://www.matchpoint.ge",
  name: "MatchPoint",
  logo: "/matchpoint-logo.png",
  locale: "ka_GE",
  title: "MatchPoint — პინგ-პონგის კლუბი თბილისში | Ping Pong Club Tbilisi",
  description:
    "MatchPoint — პინგ-პონგის კლუბი თბილისში. დაჯავშნე მაგიდა ონლაინ, მიიღე მონაწილეობა ტურნირებში და ისიამოვნე ბარით. Ping pong club in Tbilisi: book tables online, tournaments and a bar.",
  phone: "+995555613330",
  email: "matchpoint.ge@gmail.com",
  address: {
    streetAddress: "17 Petre Kavtaradze St",
    addressLocality: "Tbilisi",
    postalCode: "0186",
    addressCountry: "GE",
  },
};

export function absoluteUrl(path, base = SITE.url) {
  if (!path) return base;
  if (/^https?:\/\//.test(path)) return path;
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

export function stripHtml(html) {
  return String(html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITIES[e])
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(text, max = 160) {
  const clean = String(text || "").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Stored images are base64 data URLs; crawlers and <img> get them from
// /api/image instead. ?v= changes whenever the row is edited, so the image
// can be cached for a long time.
export function imagePath(type, row) {
  const value = type === "blog" ? row?.cover_image : row?.image;
  if (value === null || value === "") return null;
  if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  if (!row?.id) return null;
  const version = row.updated_at ? `&v=${encodeURIComponent(Date.parse(row.updated_at) || row.updated_at)}` : "";
  return `/api/image?type=${type}&id=${encodeURIComponent(row.id)}${version}`;
}

const ORGANIZATION = {
  "@type": "SportsActivityLocation",
  "@id": `${SITE.url}/#club`,
  name: SITE.name,
  url: SITE.url,
  logo: absoluteUrl(SITE.logo),
  image: absoluteUrl(SITE.logo),
  telephone: SITE.phone,
  email: SITE.email,
  address: { "@type": "PostalAddress", ...SITE.address },
  sport: "Table tennis",
};

// ── Page metadata ────────────────────────────────────────────────────
// Each returns { title, description, path, image, type, jsonLd, noindex }.

export function homeSeo() {
  return {
    title: SITE.title,
    description: SITE.description,
    path: "/",
    jsonLd: { "@context": "https://schema.org", ...ORGANIZATION },
  };
}

export function blogPostSeo(post) {
  const description = truncate(post.excerpt || stripHtml(post.content));
  const image = imagePath("blog", post);
  return {
    title: `${String(post.title).trim()} — MatchPoint`,
    description,
    path: `/blog/${post.slug}`,
    image,
    type: "article",
    publishedTime: post.published_at || post.created_at,
    modifiedTime: post.updated_at,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: String(post.title).trim(),
      description,
      image: image ? [absoluteUrl(image)] : undefined,
      datePublished: post.published_at || post.created_at,
      dateModified: post.updated_at || post.published_at,
      author: { "@type": "Organization", name: post.author || SITE.name },
      publisher: { "@type": "Organization", name: SITE.name, logo: { "@type": "ImageObject", url: absoluteUrl(SITE.logo) } },
      mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`),
    },
  };
}

export function eventSeo(event) {
  const description = truncate(stripHtml(event.description) || `${event.title} — MatchPoint, Tbilisi`);
  const image = imagePath("event", event);
  const fee = Number(event.entry_fee || 0);
  return {
    title: `${String(event.title).trim()} — MatchPoint`,
    description,
    path: `/events/${event.id}`,
    image,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Event",
      name: String(event.title).trim(),
      description,
      startDate: event.event_date,
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      image: image ? [absoluteUrl(image)] : undefined,
      location: { "@type": "Place", name: SITE.name, address: { "@type": "PostalAddress", ...SITE.address } },
      organizer: { "@type": "Organization", name: SITE.name, url: SITE.url },
      offers: {
        "@type": "Offer",
        price: fee.toFixed(2),
        priceCurrency: "GEL",
        url: absoluteUrl(`/events/${event.id}`),
        availability: "https://schema.org/InStock",
        validThrough: event.registration_deadline || event.event_date,
      },
    },
  };
}

export function productSeo(product) {
  return {
    title: `${String(product.title).trim()} — MatchPoint`,
    description: truncate(product.subtitle || stripHtml(product.description) || SITE.description),
    path: `/services/${product.id}`,
    image: imagePath("product", product),
  };
}

export function pageSeo(title, description, path, extra = {}) {
  return {
    title: title ? `${String(title).trim()} — MatchPoint` : SITE.title,
    description: description ? truncate(stripHtml(description)) : SITE.description,
    path,
    ...extra,
  };
}

// Fill in defaults and absolute URLs.
export function resolveSeo(seo = {}, base = SITE.url) {
  return {
    title: seo.title || SITE.title,
    description: seo.description || SITE.description,
    url: absoluteUrl(seo.path || "/", base),
    image: absoluteUrl(seo.image || SITE.logo, base),
    type: seo.type || "website",
    jsonLd: seo.jsonLd ? JSON.parse(JSON.stringify(seo.jsonLd)) : null, // drops undefined
    noindex: Boolean(seo.noindex),
    publishedTime: seo.publishedTime || null,
    modifiedTime: seo.modifiedTime || null,
  };
}

// <head> tags for the server-rendered HTML.
export function headTags(seo, base = SITE.url) {
  const s = resolveSeo(seo, base);
  const meta = (attr, key, content) =>
    content ? `<meta ${attr}="${key}" content="${escapeHtml(content)}" />` : "";
  return [
    `<title>${escapeHtml(s.title)}</title>`,
    meta("name", "description", s.description),
    s.noindex ? meta("name", "robots", "noindex") : "",
    `<link rel="canonical" href="${escapeHtml(s.url)}" />`,
    meta("property", "og:site_name", SITE.name),
    meta("property", "og:locale", SITE.locale),
    meta("property", "og:type", s.type),
    meta("property", "og:title", s.title),
    meta("property", "og:description", s.description),
    meta("property", "og:url", s.url),
    meta("property", "og:image", s.image),
    meta("property", "article:published_time", s.publishedTime),
    meta("property", "article:modified_time", s.modifiedTime),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", s.title),
    meta("name", "twitter:description", s.description),
    meta("name", "twitter:image", s.image),
    s.jsonLd
      ? `<script type="application/ld+json" id="seo-jsonld">${JSON.stringify(s.jsonLd).replace(/</g, "\\u003c")}</script>`
      : "",
  ]
    .filter(Boolean)
    .join("\n    ");
}

// Replace index.html's default head tags (title, description, canonical,
// Open Graph, Twitter, JSON-LD) with this page's.
export function injectHead(html, seo, base = SITE.url) {
  const withoutDefaults = html
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\s+name="(description|robots|twitter:[^"]*)"[^>]*>/gi, "")
    .replace(/<meta\s+property="(og|article):[^"]*"[^>]*>/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>/gi, "")
    .replace(/<script\s+type="application\/ld\+json"[\s\S]*?<\/script>/gi, "")
    .replace(/^\s*\n/gm, "");
  return withoutDefaults.replace(/<\/head>/i, `    ${headTags(seo, base)}\n  </head>`);
}
