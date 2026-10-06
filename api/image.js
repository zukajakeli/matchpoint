// Serves images stored in the database as base64 data URLs at a real URL:
//   /api/image?type=blog|event|product&id=<uuid>[&v=<updated_at>]
// Needed for link-preview images (og:image) and lets pages load images
// separately instead of inside the data. With ?v= the URL changes on every
// edit, so it is cached for a year.

import { selectOne, UUID } from "./_lib/supabase.js";

const SOURCES = {
  blog: { table: "blog_posts", column: "cover_image", visible: "is_published=eq.true" },
  event: { table: "events", column: "image", visible: "is_active=eq.true" },
  product: { table: "products", column: "image", visible: "is_active=eq.true" },
};

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const source = SOURCES[params.get("type")];
  const id = params.get("id") || "";
  if (!source || !UUID.test(id)) return new Response("Not found", { status: 404 });

  let row;
  try {
    row = await selectOne(source.table, `select=${source.column}&id=eq.${id}&${source.visible}`);
  } catch (error) {
    console.error("image:", error);
    return new Response("Error", { status: 502 });
  }
  const value = row?.[source.column];
  if (!value) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, s-maxage=300" } });

  if (/^https?:\/\//.test(value)) return Response.redirect(value, 302);

  const match = /^data:(image\/[\w.+-]+);base64,(.+)$/s.exec(value);
  if (!match) return new Response("Unsupported image", { status: 415 });

  return new Response(Buffer.from(match[2], "base64"), {
    headers: {
      "Content-Type": match[1],
      "Cache-Control": params.get("v")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600, s-maxage=86400",
    },
  });
}
