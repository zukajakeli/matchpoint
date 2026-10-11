import React, { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/LanguageContext";
import { SITE } from "../../seo/seo";
import { FALLBACK_PROFILE_URL } from "../../utils/googleReviews";
import ScrollCarousel from "./ScrollCarousel";
import "./ReviewsSection.css";

// `vite dev` has no /api functions; production's answers with the same data.
const ENDPOINT = import.meta.env.DEV ? `${SITE.url}/api/reviews` : "/api/reviews";

function Stars({ rating, label }) {
  return (
    <span className="mp-review-stars" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className={n <= Math.round(rating) ? "on" : ""}>
          <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="currentColor" />
        </svg>
      ))}
    </span>
  );
}

function ReviewCard({ review, lang, t }) {
  const [expanded, setExpanded] = useState(false);
  const long = review.text.length > 260;
  const date = review.publishTime
    ? new Date(review.publishTime).toLocaleDateString(lang === "ka" ? "ka-GE" : "en-GB", { month: "long", year: "numeric" })
    : review.relativeTime;
  const initial = review.author.trim().charAt(0).toUpperCase() || "G";

  return (
    <article className="mp-review-card mp-carousel-item">
      <header className="mp-review-head">
        {review.photoUrl ? (
          <img className="mp-review-avatar" src={review.photoUrl} alt="" width="44" height="44" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="mp-review-avatar mp-review-avatar-letter" aria-hidden="true">{initial}</span>
        )}
        <div className="mp-review-who">
          {review.authorUrl ? (
            <a href={review.authorUrl} target="_blank" rel="noopener noreferrer" className="mp-review-author">{review.author}</a>
          ) : (
            <span className="mp-review-author">{review.author}</span>
          )}
          {date && <time dateTime={review.publishTime || undefined} className="mp-review-date">{date}</time>}
        </div>
      </header>
      <Stars rating={review.rating} label={t("reviews_stars").replace("{n}", review.rating)} />
      <p className={`mp-review-text ${expanded ? "is-expanded" : ""}`} lang={review.language || undefined}>
        {review.text}
      </p>
      {long && (
        <button type="button" className="mp-review-more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? t("reviews_show_less") : t("reviews_read_more")}
        </button>
      )}
      <footer className="mp-review-foot">
        <span className="mp-review-source">Google Maps</span>
        {review.reviewUrl && (
          <a href={review.reviewUrl} target="_blank" rel="noopener noreferrer" className="mp-review-link">
            {t("reviews_on_google")}
          </a>
        )}
      </footer>
    </article>
  );
}

// Authentic Google reviews only. With no reviews (API not configured,
// error, or none with text) the section shows just the link to Google.
export default function ReviewsSection() {
  const { t, lang } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${ENDPOINT}?lang=${lang}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => !cancelled && setData(json || { reviews: [] }))
      .catch(() => !cancelled && setData({ reviews: [] }));
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const reviews = data?.reviews || [];
  const profileUrl = data?.profileUrl || FALLBACK_PROFILE_URL;

  return (
    <section className="mp-section-alt mp-dots-blue mp-reviews" id="reviews" aria-labelledby="mp-reviews-title">
      <h2 className="mp-section-title" id="mp-reviews-title">{t("reviews_title")}</h2>
      <p className="mp-section-lead">
        {reviews.length > 0 ? t("reviews_subtitle") : data ? t("reviews_cta_only") : " "}
      </p>

      {data?.rating && reviews.length > 0 && (
        <div className="mp-reviews-summary">
          <strong>{Number(data.rating).toFixed(1)}</strong>
          <Stars rating={data.rating} label={t("reviews_stars").replace("{n}", Number(data.rating).toFixed(1))} />
          {data.total ? <span>{t("reviews_count").replace("{n}", data.total)}</span> : null}
        </div>
      )}

      {data === null && <div className="mp-reviews-loading" aria-hidden="true" />}

      {reviews.length > 0 && (
        <ScrollCarousel label={t("reviews_title")} className="mp-reviews-carousel">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} lang={lang} t={t} />
          ))}
        </ScrollCarousel>
      )}

      <div className="mp-section-cta">
        <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="mp-btn mp-btn-secondary mp-reviews-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2a7 7 0 00-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" fill="currentColor" />
          </svg>
          {t("reviews_more")}
        </a>
      </div>
    </section>
  );
}
