import { useEffect } from "react";
import { resolveSeo } from "../seo/seo";

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

// Keeps <head> in sync with the current page (title, description, canonical,
// Open Graph, Twitter, JSON-LD). Updates the tags index.html already has
// instead of adding duplicates. Crawlers that don't run JS get the same
// tags from api/seo.js.
export default function Seo(props) {
  // Canonical/OG URLs always point at production, also on previews/localhost.
  const s = resolveSeo(props);
  const jsonLd = s.jsonLd ? JSON.stringify(s.jsonLd) : "";

  useEffect(() => {
    document.title = s.title;
    setMeta("name", "description", s.description);
    setMeta("name", "robots", s.noindex ? "noindex" : null);
    setMeta("property", "og:type", s.type);
    setMeta("property", "og:title", s.title);
    setMeta("property", "og:description", s.description);
    setMeta("property", "og:url", s.url);
    setMeta("property", "og:image", s.image);
    setMeta("property", "article:published_time", s.publishedTime);
    setMeta("property", "article:modified_time", s.modifiedTime);
    setMeta("name", "twitter:title", s.title);
    setMeta("name", "twitter:description", s.description);
    setMeta("name", "twitter:image", s.image);

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = s.url;

    let script = document.getElementById("seo-jsonld");
    if (!jsonLd) {
      script?.remove();
    } else {
      if (!script) {
        script = document.createElement("script");
        script.type = "application/ld+json";
        script.id = "seo-jsonld";
        document.head.appendChild(script);
      }
      script.textContent = jsonLd;
    }
  }, [s.title, s.description, s.url, s.image, s.type, s.noindex, s.publishedTime, s.modifiedTime, jsonLd]);

  return null;
}
