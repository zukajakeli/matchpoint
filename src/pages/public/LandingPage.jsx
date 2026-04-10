import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../../services/supabaseClient";
import { useTranslation } from "../../i18n/LanguageContext";
import PublicLayout from "../../components/landing/PublicLayout";
import "./LandingPage.css";

const VENUE_NAME = import.meta.env.VITE_VENUE_NAME || "MatchPoint";

export default function LandingPage() {
  const { t, lang } = useTranslation();
  const [products, setProducts] = useState([]);
  const [events, setEvents] = useState([]);
  const [blogPosts, setBlogPosts] = useState([]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    supabase.from("products").select("*").eq("is_active", true).order("display_order").then(({ data }) => {
      setProducts(data || []);
    });

    supabase.from("events").select("*").eq("is_active", true).order("event_date", { ascending: true }).limit(3).then(({ data }) => {
      setEvents(data || []);
    });

    supabase.from("blog_posts").select("id, title, slug, excerpt, cover_image, published_at").eq("is_published", true).order("published_at", { ascending: false }).limit(3).then(({ data }) => {
      setBlogPosts(data || []);
    });
  }, []);

  const dateLang = lang === "ka" ? "ka-GE" : "en-GB";

  return (
    <PublicLayout>
      {/* Hero Banner */}
      <section className="mp-hero">
        <div className="mp-hero-content">
          <div className="mp-hero-logo-wrapper">
            <img src="/matchpoint-logo.png" alt={VENUE_NAME} className="mp-hero-logo" />
          </div>
          <h1 className="mp-hero-title">
            {t("hero_title_1")}<br />{t("hero_title_2")}
          </h1>
          <p className="mp-hero-subtitle">
            {t("hero_subtitle")}
          </p>
          <div className="mp-hero-actions">
            <Link to="/book" className="mp-btn mp-btn-primary">{t("hero_book")}</Link>
            <Link to="/events" className="mp-btn mp-btn-outline">{t("hero_events")}</Link>
          </div>
        </div>
        <div className="mp-hero-decoration">
          <div className="mp-hero-ball" />
          <div className="mp-hero-ball mp-hero-ball-2" />
        </div>
      </section>

      {/* Products / Services */}
      {products.length > 0 && (
        <section className="mp-section" id="services">
          <h2 className="mp-section-title">{t("section_services")}</h2>
          <div className="mp-products-grid">
            {products.map((p) => (
              <Link to={`/services/${p.id}`} key={p.id} className="mp-product-card">
                {p.image && (
                  <div className="mp-product-image">
                    <img src={p.image} alt={p.title} />
                  </div>
                )}
                <div className="mp-product-info">
                  <h3>{p.title}</h3>
                  {p.subtitle && <p className="mp-product-subtitle">{p.subtitle}</p>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Events */}
      {events.length > 0 && (
        <section className="mp-section mp-section-alt" id="events">
          <h2 className="mp-section-title">{t("section_events")}</h2>
          <div className="mp-events-grid">
            {events.map((ev) => (
              <Link to={`/events/${ev.id}`} key={ev.id} className="mp-event-card">
                {ev.image && (
                  <div className="mp-event-image">
                    <img src={ev.image} alt={ev.title} />
                  </div>
                )}
                <div className="mp-event-info">
                  <span className="mp-event-date">
                    {new Date(ev.event_date).toLocaleDateString(dateLang, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <h3>{ev.title}</h3>
                  {ev.entry_fee > 0 && <span className="mp-event-fee">{ev.entry_fee} ₾ {t("events_entry")}</span>}
                </div>
              </Link>
            ))}
          </div>
          <div className="mp-section-cta">
            <Link to="/events" className="mp-btn mp-btn-secondary">{t("section_view_all_events")}</Link>
          </div>
        </section>
      )}

      {/* Blog Preview */}
      {blogPosts.length > 0 && (
        <section className="mp-section" id="blog">
          <h2 className="mp-section-title">{t("section_blog")}</h2>
          <div className="mp-blog-grid">
            {blogPosts.map((post) => (
              <Link to={`/blog/${post.slug}`} key={post.id} className="mp-blog-card">
                {post.cover_image && (
                  <div className="mp-blog-image">
                    <img src={post.cover_image} alt={post.title} />
                  </div>
                )}
                <div className="mp-blog-info">
                  <h3>{post.title}</h3>
                  {post.excerpt && <p>{post.excerpt}</p>}
                  <span className="mp-blog-date">
                    {post.published_at && new Date(post.published_at).toLocaleDateString(dateLang, { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
          <div className="mp-section-cta">
            <Link to="/blog" className="mp-btn mp-btn-secondary">{t("section_read_more")}</Link>
          </div>
        </section>
      )}

      {/* CTA Banner */}
      <section className="mp-cta-banner">
        <h2>{t("cta_title")}</h2>
        <p>{t("cta_subtitle")}</p>
        <Link to="/book" className="mp-btn mp-btn-lime">{t("cta_book")}</Link>
      </section>
    </PublicLayout>
  );
}
