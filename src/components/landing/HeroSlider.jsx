import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "../../i18n/LanguageContext";
import { imagePath, SITE } from "../../seo/seo";
import { DEFAULT_HERO_IMAGE, pick } from "../../content/siteDefaults";
import "./HeroSlider.css";

const INTERVAL_MS = 5000;
const SWIPE_PX = 45;

// Hero text is all caps. CSS text-transform leaves Georgian alone, but
// toUpperCase maps it to Mtavruli (Georgian capitals).
const caps = (text) => (text || "").toUpperCase();

function resolveSrc(path) {
  // `vite dev` has no /api functions; use production's.
  return import.meta.env.DEV && path?.startsWith("/api/") ? `${SITE.url}${path}` : path;
}

function SlideLink({ href, className, children, ...rest }) {
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} className={className} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href || "/"} className={className} {...rest}>
      {children}
    </Link>
  );
}

// Tries each source in turn (slide image → event photo → venue photo).
function SlideImage({ sources, alt, position, eager }) {
  const [index, setIndex] = useState(0);
  const src = sources[index];
  if (!src) return null;
  return (
    <img
      className="mp-slide-img"
      src={src}
      alt={alt}
      style={{ objectPosition: position || "center" }}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      decoding="async"
      onError={() => setIndex((i) => i + 1)}
    />
  );
}

/**
 * slides: rows from hero_slides (or DEFAULT_SLIDES)
 * nextEvent: the next upcoming event, used by "events" slides
 */
export default function HeroSlider({ slides, nextEvent }) {
  const { t, lang } = useTranslation();
  const count = slides.length;
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false); // stopped by the visitor
  const [held, setHeld] = useState(false); // hover / focus / touch, temporary
  const [hidden, setHidden] = useState(false); // tab in the background
  const [reducedMotion, setReducedMotion] = useState(false);
  // Only images near the current slide are loaded.
  const [seen, setSeen] = useState(() => new Set([0, 1]));
  const touch = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return undefined;
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (current >= count) setCurrent(0);
  }, [count, current]);

  const goTo = useCallback(
    (index) => {
      const next = ((index % count) + count) % count;
      setCurrent(next);
      setSeen((prev) => {
        if (prev.has(next) && prev.has((next + 1) % count)) return prev;
        return new Set([...prev, next, (next + 1) % count]);
      });
    },
    [count]
  );

  // A visitor who navigates on their own takes over: autoplay stops
  // until they press play again.
  const userGo = (index) => {
    setPaused(true);
    goTo(index);
  };

  const autoplay = count > 1 && !paused && !held && !hidden && !reducedMotion;
  useEffect(() => {
    if (!autoplay) return undefined;
    const timer = setTimeout(() => goTo(current + 1), INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [autoplay, current, goTo]);

  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      userGo(current + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      userGo(current - 1);
    }
  };

  const onTouchStart = (e) => {
    const p = e.touches[0];
    touch.current = { x: p.clientX, y: p.clientY };
    setHeld(true);
  };
  const onTouchEnd = (e) => {
    const start = touch.current;
    touch.current = null;
    setHeld(false);
    if (!start) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - start.x;
    const dy = p.clientY - start.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
      userGo(current + (dx < 0 ? 1 : -1));
    }
  };

  const onBlur = (e) => {
    if (!rootRef.current?.contains(e.relatedTarget)) setHeld(false);
  };

  if (count === 0) return null;

  const eventDate = nextEvent?.event_date
    ? new Date(nextEvent.event_date).toLocaleDateString(lang === "ka" ? "ka-GE" : "en-GB", {
        timeZone: "Asia/Tbilisi",
        weekday: "short",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <section
      ref={rootRef}
      className={`mp-hero-slider ${reducedMotion ? "no-motion" : ""}`}
      aria-roledescription="carousel"
      aria-label={t("hero_region")}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => setHeld(false)}
    >
      <div className="mp-slides" aria-live={autoplay ? "off" : "polite"}>
        {slides.map((slide, i) => {
          const isEvents = slide.kind === "events";
          const active = i === current;
          let title = pick(slide, "title", lang);
          let subtitle = pick(slide, "subtitle", lang);
          let eyebrow = null;
          if (isEvents && nextEvent) {
            eyebrow = title || null;
            title = nextEvent.title;
            if (!subtitle && eventDate) subtitle = eventDate;
          }
          const cta = pick(slide, "cta", lang);
          const href = slide.link_url || "/";
          const sources = [
            slide.image !== null ? imagePath("slide", slide) : null,
            isEvents && nextEvent ? imagePath("event", nextEvent) : null,
            DEFAULT_HERO_IMAGE,
          ]
            .filter(Boolean)
            .map(resolveSrc);
          const Heading = i === 0 ? "h1" : "h2";

          return (
            <div
              key={slide.id}
              className={`mp-slide ${active ? "is-active" : ""}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${count}`}
              aria-hidden={!active}
              inert={!active}
            >
              {seen.has(i) && (
                <SlideImage
                  sources={[...new Set(sources)]}
                  alt={slide.image_alt || title}
                  position={slide.image_position}
                  eager={i === 0}
                />
              )}
              <div className="mp-slide-shade" />
              {/* The whole slide is clickable; the button is the accessible link */}
              <SlideLink href={href} className="mp-slide-hit" tabIndex={-1} aria-hidden="true" />
              <div className="mp-slide-content">
                {eyebrow && <p className="mp-slide-eyebrow">{caps(eyebrow)}</p>}
                {title && <Heading className="mp-slide-title">{caps(title)}</Heading>}
                {subtitle && <p className="mp-slide-subtitle">{caps(subtitle)}</p>}
                {cta ? (
                  <SlideLink href={href} className="mp-btn mp-btn-lime mp-slide-cta">
                    {caps(cta)}
                  </SlideLink>
                ) : (
                  <SlideLink href={href} className="mp-slide-sr-link">
                    {title}
                  </SlideLink>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <>
          <button type="button" className="mp-slider-arrow prev" onClick={() => userGo(current - 1)} aria-label={t("hero_prev")}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="mp-slider-arrow next" onClick={() => userGo(current + 1)} aria-label={t("hero_next")}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="mp-slider-controls">
            <div className="mp-slider-dots">
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  className={`mp-slider-dot ${i === current ? "is-active" : ""}`}
                  onClick={() => userGo(i)}
                  aria-label={`${t("hero_goto")} ${i + 1}`}
                  aria-current={i === current ? "true" : undefined}
                >
                  {i === current && autoplay && <span className="mp-slider-dot-progress" key={current} />}
                </button>
              ))}
            </div>
            {!reducedMotion && (
              <button
                type="button"
                className="mp-slider-toggle"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? t("hero_play") : t("hero_pause")}
              >
                {paused ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor" /></svg>
                )}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
