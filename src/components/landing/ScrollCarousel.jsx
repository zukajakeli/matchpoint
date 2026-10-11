import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/LanguageContext";
import "./ScrollCarousel.css";

// Horizontal scroller used by the services, reviews and gallery sections.
// Native scrolling (touch swipe, trackpad, keyboard once focused) with
// scroll snapping; on larger screens arrow buttons page through it.
// Children should be elements with the "mp-carousel-item" class.
export default function ScrollCarousel({ label, className = "", children }) {
  const { t } = useTranslation();
  const trackRef = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const updateEdges = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft >= max - 4 });
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    updateEdges();
    el.addEventListener("scroll", updateEdges, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateEdges) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", updateEdges);
      observer?.disconnect();
    };
  }, [updateEdges, children]);

  const page = (direction) => {
    const el = trackRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: reduce ? "auto" : "smooth" });
  };

  const scrollable = !(edges.start && edges.end);

  return (
    <div className={`mp-carousel ${scrollable ? "is-scrollable" : ""} ${className}`}>
      <button
        type="button"
        className="mp-carousel-arrow prev"
        onClick={() => page(-1)}
        disabled={edges.start}
        aria-label={t("scroller_prev")}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div
        ref={trackRef}
        className="mp-carousel-track"
        role="region"
        aria-label={label}
        tabIndex={scrollable ? 0 : -1}
      >
        {children}
      </div>
      <button
        type="button"
        className="mp-carousel-arrow next"
        onClick={() => page(1)}
        disabled={edges.end}
        aria-label={t("scroller_next")}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
