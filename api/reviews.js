// /api/reviews?lang=ka|en — Google reviews for the homepage, fetched live
// from the official Places API (New) on the server, so the API key never
// reaches the browser.
//
// Environment (Vercel → Settings → Environment Variables):
//   GOOGLE_PLACES_API_KEY  required. A key with "Places API (New)" enabled.
//   GOOGLE_PLACE_ID        the place id (ChIJ...). Optional if one of:
//   GOOGLE_MAPS_URL        the Google Maps / Business Profile link, or
//   GOOGLE_PLACE_QUERY     a text search such as "MatchPoint Tbilisi".
//   GOOGLE_REVIEWS_URL     optional link for the "read more" button.
//
// Without a key the response is { configured: false, reviews: [] } and the
// homepage shows only the link to Google, never placeholder reviews.

import {
  DEFAULT_PLACE_QUERY,
  FALLBACK_PROFILE_URL,
  parseMapsUrl,
  selectReviews,
} from "../src/utils/googleReviews.js";

const API = "https://places.googleapis.com/v1";
let resolvedPlaceId = null;

function respond(body, maxAge) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}`,
    },
  });
}

async function findPlaceId(key) {
  if (process.env.GOOGLE_PLACE_ID) return process.env.GOOGLE_PLACE_ID;
  if (resolvedPlaceId) return resolvedPlaceId;
  const fromUrl = parseMapsUrl(process.env.GOOGLE_MAPS_URL);
  if (fromUrl.placeId) return (resolvedPlaceId = fromUrl.placeId);

  const res = await fetch(`${API}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id",
    },
    body: JSON.stringify({ textQuery: process.env.GOOGLE_PLACE_QUERY || fromUrl.query || DEFAULT_PLACE_QUERY }),
  });
  if (!res.ok) throw new Error(`searchText ${res.status}: ${await res.text()}`);
  const id = (await res.json()).places?.[0]?.id;
  if (!id) throw new Error("place not found");
  return (resolvedPlaceId = id);
}

export async function GET(request) {
  const lang = new URL(request.url).searchParams.get("lang") === "en" ? "en" : "ka";
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const profileUrl = process.env.GOOGLE_REVIEWS_URL || process.env.GOOGLE_MAPS_URL || FALLBACK_PROFILE_URL;
  if (!key) return respond({ configured: false, reviews: [], profileUrl }, 300);

  try {
    const placeId = await findPlaceId(key);
    const res = await fetch(`${API}/places/${encodeURIComponent(placeId)}?languageCode=${lang}`, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "id,rating,userRatingCount,googleMapsUri,googleMapsLinks,reviews",
      },
    });
    if (!res.ok) throw new Error(`place details ${res.status}: ${await res.text()}`);
    const place = await res.json();
    return respond(
      {
        configured: true,
        rating: place.rating ?? null,
        total: place.userRatingCount ?? null,
        profileUrl:
          process.env.GOOGLE_REVIEWS_URL || place.googleMapsLinks?.reviewsUri || place.googleMapsUri || profileUrl,
        writeReviewUrl: place.googleMapsLinks?.writeAReviewUri || null,
        reviews: selectReviews(place.reviews),
      },
      3600
    );
  } catch (error) {
    console.error("reviews:", error);
    return respond({ configured: true, error: true, reviews: [], profileUrl }, 60);
  }
}
