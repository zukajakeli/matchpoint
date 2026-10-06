import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../../services/supabaseClient";
import { useTranslation } from "../../i18n/LanguageContext";
import PublicLayout from "../../components/landing/PublicLayout";
import ContentImage from "../../components/landing/ContentImage";
import { pageSeo } from "../../seo/seo";
import "./BlogListPage.css";

export default function BlogListPage() {
  const { t, lang } = useTranslation();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) { setLoading(false); return; }
    supabase
      .from("blog_posts")
      .select("id, title, slug, excerpt, published_at, author, updated_at")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .then(({ data }) => {
        setPosts(data || []);
        setLoading(false);
      });
  }, []);

  const dateLang = lang === "ka" ? "ka-GE" : "en-GB";

  return (
    <PublicLayout seo={pageSeo(t("blog_title"), t("blog_subtitle"), "/blog")}>
      <div className="mp-blog-list-page">
        <section className="mp-blog-list-hero mp-dots-white mp-grain">
          <h1>{t("blog_title")}</h1>
          <p>{t("blog_subtitle")}</p>
        </section>

        <section className="mp-blog-list-content">
          {loading ? (
            <p className="mp-blog-list-loading">{t("blog_loading")}</p>
          ) : posts.length === 0 ? (
            <p className="mp-blog-list-empty">{t("blog_empty")}</p>
          ) : (
            <div className="mp-blog-list-grid">
              {posts.map((post) => (
                <Link to={`/blog/${post.slug}`} key={post.id} className="mp-blog-list-card">
                  <ContentImage type="blog" row={post} alt={post.title} className="mp-blog-list-card-image" />
                  <div className="mp-blog-list-card-info">
                    <h2>{post.title}</h2>
                    {post.excerpt && <p>{post.excerpt}</p>}
                    <div className="mp-blog-list-meta">
                      <span>{post.author || "MatchPoint"}</span>
                      <span>
                        {post.published_at &&
                          new Date(post.published_at).toLocaleDateString(dateLang, {
                            timeZone: "Asia/Tbilisi",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </PublicLayout>
  );
}
