// Google reviews for the homepage, from the official Places API (New).
// Google returns at most 5 reviews per place (its "most relevant" pick);
// there is no supported way to list more, so the homepage shows the best
// of those. Nothing here is ever invented: no reviews → no review cards.
//
// Pure helpers shared by api/reviews.js and the tests.

export const DEFAULT_PLACE_QUERY = "MatchPoint, 17 Petre Kavtaradze St, Tbilisi";

export const FALLBACK_PROFILE_URL =
  "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(DEFAULT_PLACE_QUERY);

// Pull what we can out of a Google Maps / Business Profile link:
//   ...?query_place_id=ChIJ...   or   place_id:ChIJ...   → the place id
//   .../maps/place/MatchPoint+Ping+Pong/@41.7,...        → a search query
export function parseMapsUrl(url) {
  if (!url) return {};
  let decoded = String(url);
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // keep the raw string
  }
  const idMatch = /(?:query_place_id=|place_id[:=])([A-Za-z0-9_-]{20,})/.exec(decoded);
  if (idMatch) return { placeId: idMatch[1] };
  const nameMatch = /\/maps\/place\/([^/@?]+)/.exec(decoded);
  if (nameMatch) return { query: nameMatch[1].replace(/\+/g, " ").trim() };
  return {};
}

function reviewText(review) {
  // originalText is what the customer wrote; text may be a translation.
  return (review?.originalText?.text || review?.text?.text || "").trim();
}

export function normalizeReview(review) {
  const author = review?.authorAttribution || {};
  return {
    id: review?.name || `${author.displayName}-${review?.publishTime}`,
    author: author.displayName || "Google user",
    authorUrl: author.uri || null,
    photoUrl: author.photoUri || null,
    rating: Number(review?.rating) || 0,
    text: reviewText(review),
    language: review?.originalText?.languageCode || review?.text?.languageCode || null,
    publishTime: review?.publishTime || null,
    relativeTime: review?.relativePublishTimeDescription || null,
    reviewUrl: review?.googleMapsUri || null,
  };
}

// Five-star reviews with real text first, longer and newer ones ahead.
// Falls back to four-star reviews only when there are too few five-star
// ones with text. Returns at most `max` reviews.
export function selectReviews(reviews, { max = 7, minLength = 40, minCount = 3 } = {}) {
  const all = (reviews || []).map(normalizeReview).filter((r) => r.text.length > 0);
  const score = (r) => {
    const length = Math.min(r.text.length, 600) / 600; // detail, capped
    const ageDays = r.publishTime ? (Date.now() - Date.parse(r.publishTime)) / 86_400_000 : 3650;
    const recency = Math.max(0, 1 - ageDays / 730); // fades over two years
    return length * 0.65 + recency * 0.35;
  };
  const byScore = (a, b) => score(b) - score(a);

  let picked = all.filter((r) => r.rating === 5 && r.text.length >= minLength).sort(byScore);
  if (picked.length < minCount) {
    const extra = all
      .filter((r) => !picked.includes(r) && r.rating >= 4)
      .sort((a, b) => b.rating - a.rating || byScore(a, b));
    picked = [...picked, ...extra];
  }
  return picked.slice(0, max);
}
