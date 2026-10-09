import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../../services/supabaseClient";
import { useTranslation } from "../../i18n/LanguageContext";
import PublicLayout from "../../components/landing/PublicLayout";
import ContentImage from "../../components/landing/ContentImage";
import { homeSeo } from "../../seo/seo";
import "./LandingPage.css";

const VENUE_NAME = import.meta.env.VITE_VENUE_NAME || "MatchPoint";

export default function LandingPage() {
  const { t, lang } = useTranslation();
  const [products, setProducts] = useState([]);
  const [events, setEvents] = useState([]);
  const [blogPosts, setBlogPosts] = useState([]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    supabase.from("products").select("id, title, subtitle, updated_at").eq("is_active", true).order("display_order").then(({ data }) => {
      setProducts(data || []);
    });

    supabase.from("events").select("id, title, event_date, entry_fee, updated_at").eq("is_active", true).order("event_date", { ascending: true }).limit(3).then(({ data }) => {
      setEvents(data || []);
    });

    supabase.from("blog_posts").select("id, title, slug, excerpt, published_at, updated_at").eq("is_published", true).order("published_at", { ascending: false }).limit(3).then(({ data }) => {
      setBlogPosts(data || []);
    });
  }, []);

  const dateLang = lang === "ka" ? "ka-GE" : "en-GB";

  return (
    <PublicLayout seo={homeSeo()}>
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
      </section>

      {/* Products / Services */}
      {products.length > 0 && (
        <section className="mp-section" id="services">
          <h2 className="mp-section-title">{t("section_services")}</h2>
          <div className="mp-products-grid">
            {products.map((p) => (
              <Link to={`/services/${p.id}`} key={p.id} className="mp-product-card">
                <ContentImage type="product" row={p} alt={p.title} className="mp-product-image" />
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
        <section className="mp-section mp-section-alt mp-dots-blue" id="events">
          <h2 className="mp-section-title">{t("section_events")}</h2>
          <div className="mp-events-grid">
            {events.map((ev) => (
              <Link to={`/events/${ev.id}`} key={ev.id} className="mp-event-card">
                <ContentImage type="event" row={ev} alt={ev.title} className="mp-event-image" />
                <div className="mp-event-info">
                  <span className="mp-event-date">
                    {new Date(ev.event_date).toLocaleDateString(dateLang, { timeZone: "Asia/Tbilisi", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
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
        <section className="mp-section mp-dots mp-grain" id="blog">
          <h2 className="mp-section-title">{t("section_blog")}</h2>
          <div className="mp-blog-grid">
            {blogPosts.map((post) => (
              <Link to={`/blog/${post.slug}`} key={post.id} className="mp-blog-card">
                <ContentImage type="blog" row={post} alt={post.title} className="mp-blog-image" />
                <div className="mp-blog-info">
                  <h3>{post.title}</h3>
                  {post.excerpt && <p>{post.excerpt}</p>}
                  <span className="mp-blog-date">
                    {post.published_at && new Date(post.published_at).toLocaleDateString(dateLang, { timeZone: "Asia/Tbilisi", day: "numeric", month: "short", year: "numeric" })}
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
      <section className="mp-cta-banner mp-dots-white mp-grain">
        <h2>{t("cta_title")}</h2>
        <p>{t("cta_subtitle")}</p>
        <Link to="/book" className="mp-btn mp-btn-lime">{t("cta_book")}</Link>
      </section>
    </PublicLayout>
  );
}
