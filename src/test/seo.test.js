import { describe, it, expect } from "vitest";
import {
  blogPostSeo,
  eventSeo,
  productSeo,
  pageSeo,
  homeSeo,
  injectHead,
  imagePath,
  stripHtml,
  truncate,
} from "../seo/seo.js";

const TEMPLATE = `<!doctype html><html lang="ka"><head>
<meta charset="UTF-8" />
${injectHead("<head></head>", homeSeo()).replace(/<\/?head>/g, "")}
<script type="module" src="/assets/index-abc.js"></script>
</head><body><div id="root"></div></body></html>`;

describe("seo", () => {
  it("cleans HTML and shortens descriptions on a word boundary", () => {
    expect(stripHtml("<p>Hello&nbsp;<b>world</b></p><script>x()</script>")).toBe("Hello world");
    const long = "word ".repeat(60);
    expect(truncate(long).length).toBeLessThanOrEqual(160);
    expect(truncate(long).endsWith("…")).toBe(true);
  });

  it("serves stored base64 images from /api/image with a cache-busting version", () => {
    expect(imagePath("blog", { id: "a1", cover_image: "data:image/jpeg;base64,xx", updated_at: "2026-10-01T00:00:00Z" }))
      .toBe(`/api/image?type=blog&id=a1&v=${Date.parse("2026-10-01T00:00:00Z")}`);
    expect(imagePath("event", { id: "e1", image: null })).toBeNull();
    expect(imagePath("event", { id: "e1", image: "https://cdn.example/x.jpg" })).toBe("https://cdn.example/x.jpg");
    // lists don't fetch the image column: assume it may exist
    expect(imagePath("product", { id: "p1" })).toBe("/api/image?type=product&id=p1");
  });

  it("describes a blog post for search and link previews", () => {
    const seo = blogPostSeo({
      id: "b1", slug: "spring-cup", title: " Spring Cup ", excerpt: "", content: "<p>Join our <b>spring</b> tournament</p>",
      cover_image: "data:image/png;base64,xx", published_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-02T10:00:00Z",
    });
    expect(seo.title).toBe("Spring Cup — MatchPoint");
    expect(seo.description).toBe("Join our spring tournament");
    expect(seo.path).toBe("/blog/spring-cup");
    expect(seo.jsonLd["@type"]).toBe("BlogPosting");
  });

  it("marks events up with date, place and price", () => {
    const seo = eventSeo({ id: "e1", title: "FIFA Cup", description: "", event_date: "2026-11-01T15:00:00Z", entry_fee: 20, image: null });
    expect(seo.jsonLd).toMatchObject({ "@type": "Event", startDate: "2026-11-01T15:00:00Z", offers: { price: "20.00", priceCurrency: "GEL" } });
    expect(productSeo({ id: "p1", title: "Table tennis ", subtitle: "pingpong" }).title).toBe("Table tennis — MatchPoint");
  });

  it("replaces index.html's default head tags instead of duplicating them", () => {
    const out = injectHead(TEMPLATE, blogPostSeo({ id: "b1", slug: "x", title: "Post <1>", excerpt: "Hi \"there\"", cover_image: null }));
    expect(out.match(/<title>/g)).toHaveLength(1);
    expect(out.match(/name="description"/g)).toHaveLength(1);
    expect(out.match(/rel="canonical"/g)).toHaveLength(1);
    expect(out.match(/property="og:image"/g)).toHaveLength(1);
    expect(out.match(/application\/ld\+json/g)).toHaveLength(1);
    expect(out).toContain("<title>Post &lt;1&gt; — MatchPoint</title>");
    expect(out).toContain('content="Hi &quot;there&quot;"');
    expect(out).toContain('href="https://www.matchpoint.ge/blog/x"');
    expect(out).toContain('src="/assets/index-abc.js"'); // app still loads
  });

  it("can mark pages noindex", () => {
    const out = injectHead(TEMPLATE, pageSeo(null, null, "/blog/missing", { noindex: true }));
    expect(out).toContain('<meta name="robots" content="noindex" />');
  });
});
