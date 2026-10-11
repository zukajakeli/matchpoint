import { describe, it, expect } from "vitest";
import { parseMapsUrl, selectReviews, normalizeReview } from "../utils/googleReviews.js";

const review = (rating, text, publishTime = "2026-09-01T10:00:00Z", name = text.slice(0, 8)) => ({
  name: `places/x/reviews/${name}`,
  rating,
  text: { text: `translated: ${text}`, languageCode: "en" },
  originalText: { text, languageCode: "ka" },
  authorAttribution: { displayName: `Author ${name}`, uri: "https://maps.google.com/u", photoUri: "https://p" },
  publishTime,
  relativePublishTimeDescription: "a month ago",
  googleMapsUri: "https://maps.google.com/r",
});

describe("parseMapsUrl", () => {
  it("finds a place id", () => {
    expect(parseMapsUrl("https://www.google.com/maps/search/?api=1&query=x&query_place_id=ChIJN1t_tDeuEmsRUsoyG83frY4"))
      .toEqual({ placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4" });
    expect(parseMapsUrl("https://maps.google.com/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4"))
      .toEqual({ placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4" });
  });

  it("falls back to the place name", () => {
    expect(parseMapsUrl("https://www.google.com/maps/place/Match+Point+Tbilisi/@41.72,44.78,17z/data=!3m1"))
      .toEqual({ query: "Match Point Tbilisi" });
  });

  it("returns nothing for unknown links", () => {
    expect(parseMapsUrl("https://maps.app.goo.gl/abc")).toEqual({});
    expect(parseMapsUrl(undefined)).toEqual({});
  });
});

describe("selectReviews", () => {
  it("uses the original text and keeps attribution", () => {
    const r = normalizeReview(review(5, "ძალიან მაგარი ადგილია"));
    expect(r.text).toBe("ძალიან მაგარი ადგილია");
    expect(r.author).toBe("Author ძალიან მ");
    expect(r.authorUrl).toBe("https://maps.google.com/u");
    expect(r.language).toBe("ka");
  });

  it("prefers detailed five-star reviews and drops short or low ones", () => {
    const long = "Great venue with lots of tables, friendly staff and a really good bar. Will come back with friends.";
    const picked = selectReviews([
      review(5, "Nice"),
      review(3, long, undefined, "three"),
      review(5, long, undefined, "five-long"),
      review(5, `${long} ${long}`, undefined, "five-longer"),
      review(4, long, undefined, "four"),
      review(5, `Short but fine review text, ok.`.padEnd(45, "!"), undefined, "five-mid"),
    ]);
    expect(picked.map((r) => r.id.split("/").pop())).toEqual(["five-longer", "five-long", "five-mid"]);
  });

  it("tops up with four-star reviews when five-star ones are scarce", () => {
    const text = "Solid place to play ping pong after work, tables are in good shape.";
    const picked = selectReviews([review(5, text, undefined, "a"), review(4, text, undefined, "b"), review(2, text, undefined, "c")]);
    expect(picked.map((r) => r.rating)).toEqual([5, 4]);
  });

  it("never returns reviews without text and respects max", () => {
    const empty = { ...review(5, "x"), originalText: undefined, text: undefined };
    expect(selectReviews([empty])).toEqual([]);
    const many = Array.from({ length: 10 }, (_, i) => review(5, "A detailed review that is long enough to count.", undefined, `r${i}`));
    expect(selectReviews(many, { max: 7 })).toHaveLength(7);
    expect(selectReviews(undefined)).toEqual([]);
  });
});
