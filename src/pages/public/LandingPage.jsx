import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../../services/supabaseClient";
import { fetchHeroSlides, fetchGalleryImages } from "../../services/supabase/siteContentApi";
import { useTranslation } from "../../i18n/LanguageContext";
import PublicLayout from "../../components/landing/PublicLayout";
import ContentImage from "../../components/landing/ContentImage";
import HeroSlider from "../../components/landing/HeroSlider";
import ScrollCarousel from "../../components/landing/ScrollCarousel";
import ReviewsSection from "../../components/landing/ReviewsSection";
import GallerySection from "../../components/landing/GallerySection";
import { DEFAULT_SLIDES } from "../../content/siteDefaults";
import { homeSeo } from "../../seo/seo";
import "./LandingPage.css";

const PRODUCT_FIELDS = "id, title, subtitle, updated_at";

// Services marked "show on homepage". Falls back to all active services if
// the show_on_home column hasn't been added to the database yet.
async function loadHomeProducts() {
  const base = () => supabase.from("products").select(PRODUCT_FIELDS).eq("is_active", true).order("display_order");
  const { data, error } = await base().eq("show_on_home", true);
  if (!error) return data || [];
  const fallback = await base();
  return fallback.data || [];
}

// Homepage: hero slider → services → Google reviews → venue gallery.
export default function LandingPage() {
  const { t } = useTranslation();
  const [slides, setSlides] = useState(isSupabaseConfigured ? null : DEFAULT_SLIDES);
  const [nextEvent, setNextEvent] = useState(null);
  const [products, setProducts] = useState([]);
  const [gallery, setGallery] = useState([]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    fetchHeroSlides()
      .then((rows) => setSlides(rows.length ? rows : DEFAULT_SLIDES))
      .catch(() => setSlides(DEFAULT_SLIDES));

    supabase
      .from("events")
      .select("id, title, event_date, updated_at")
      .eq("is_active", true)
      .gte("event_date", new Date().toISOString())
      .order("event_date", { ascending: true })
      .limit(1)
      .then(({ data }) => setNextEvent(data?.[0] || null));

    loadHomeProducts().then(setProducts).catch(() => setProducts([]));

    fetchGalleryImages().then(setGallery).catch(() => setGallery([]));
  }, []);

  return (
    <PublicLayout seo={homeSeo()}>
      {slides ? (
        <HeroSlider slides={slides} nextEvent={nextEvent} />
      ) : (
        <div className="mp-hero-slider-placeholder" aria-hidden="true" />
      )}

      {/* Services / products */}
      {products.length > 0 && (
        <section className="mp-section mp-services" id="services" aria-labelledby="mp-services-title">
          <h2 className="mp-section-title" id="mp-services-title">{t("section_services")}</h2>
          <ScrollCarousel label={t("section_services")}>
            {products.map((p) => (
              <Link to={`/services/${p.id}`} key={p.id} className="mp-product-card mp-carousel-item">
                <ContentImage type="product" row={p} alt={p.title} className="mp-product-image" />
                <div className="mp-product-info">
                  <h3>{p.title}</h3>
                  {p.subtitle && <p className="mp-product-subtitle">{p.subtitle}</p>}
                </div>
              </Link>
            ))}
          </ScrollCarousel>
        </section>
      )}

      <ReviewsSection />

      <GallerySection images={gallery} />
    </PublicLayout>
  );
}
