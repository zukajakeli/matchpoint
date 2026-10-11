import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/LanguageContext";
import { imagePath, SITE } from "../../seo/seo";
import { pick } from "../../content/siteDefaults";
import ScrollCarousel from "./ScrollCarousel";
import "./GallerySection.css";

const src = (row) => {
  const path = imagePath("gallery", row);
  // `vite dev` has no /api functions; use production's.
  return import.meta.env.DEV && path?.startsWith("/api/") ? `${SITE.url}${path}` : path;
};

function Lightbox({ images, index, onClose, onIndex, altFor, t }) {
  const closeRef = useRef(null);
  const touch = useRef(null);
  const count = images.length;
  const go = useCallback((delta) => onIndex((index + delta + count) % count), [index, count, onIndex]);

  useEffect(() => {
    const previous = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  // Keep Tab inside the dialog
  const onKeyDown = (e) => {
    if (e.key !== "Tab") return;
    const focusable = e.currentTarget.querySelectorAll("button");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const image = images[index];
  return (
    <div
      className="mp-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t("gallery_dialog")}
      onKeyDown={onKeyDown}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1);
      }}
    >
      <button ref={closeRef} type="button" className="mp-lightbox-close" onClick={onClose} aria-label={t("gallery_close")}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>
      {count > 1 && (
        <button type="button" className="mp-lightbox-arrow prev" onClick={() => go(-1)} aria-label={t("gallery_prev")}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <figure className="mp-lightbox-figure">
        <img key={image.id} src={src(image)} alt={altFor(image)} className="mp-lightbox-img" />
        <figcaption className="mp-lightbox-caption">
          <span aria-live="polite">{index + 1} / {count}</span>
          {pick(image, "alt", "ka") && <span className="mp-lightbox-alt">{altFor(image)}</span>}
        </figcaption>
      </figure>
      {count > 1 && (
        <button type="button" className="mp-lightbox-arrow next" onClick={() => go(1)} aria-label={t("gallery_next")}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {/* Preload the neighbours so browsing feels instant */}
      {count > 1 && (
        <div hidden>
          <img src={src(images[(index + 1) % count])} alt="" />
          <img src={src(images[(index - 1 + count) % count])} alt="" />
        </div>
      )}
    </div>
  );
}

export default function GallerySection({ images }) {
  const { t, lang } = useTranslation();
  const [open, setOpen] = useState(null);
  const altFor = (row) => pick(row, "alt", lang) || t("gallery_title");

  if (!images.length) return null;

  return (
    <section className="mp-section mp-gallery" id="gallery" aria-labelledby="mp-gallery-title">
      <h2 className="mp-section-title" id="mp-gallery-title">{t("gallery_title")}</h2>
      <p className="mp-section-lead">{t("gallery_subtitle")}</p>
      <ScrollCarousel label={t("gallery_title")}>
        {images.map((image, i) => (
          <button
            key={image.id}
            type="button"
            className="mp-gallery-item mp-carousel-item"
            onClick={() => setOpen(i)}
            aria-label={`${t("gallery_open")}: ${altFor(image)}`}
          >
            <img src={src(image)} alt={altFor(image)} loading="lazy" decoding="async" width="480" height="360" />
          </button>
        ))}
      </ScrollCarousel>
      {open !== null && (
        <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} altFor={altFor} t={t} />
      )}
    </section>
  );
}
