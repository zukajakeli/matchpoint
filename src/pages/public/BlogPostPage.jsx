import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../../services/supabaseClient";
import { useTranslation } from "../../i18n/LanguageContext";
import PublicLayout from "../../components/landing/PublicLayout";
import "./BlogPostPage.css";

export default function BlogPostPage() {
  const { slug } = useParams();
  const { t, lang } = useTranslation();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !slug) return;
    supabase
      .from("blog_posts")
      .select("*")
      .eq("slug", slug)
      .eq("is_published", true)
      .single()
      .then(({ data, error }) => {
        if (!error) setPost(data);
        setLoading(false);
      });
  }, [slug]);

  const dateLang = lang === "ka" ? "ka-GE" : "en-GB";

  if (loading) {
    return (
      <PublicLayout>
        <div className="mp-blog-post-page">
          <div className="mp-blog-post-loading">{t("blog_loading")}</div>
        </div>
      </PublicLayout>
    );
  }

  if (!post) {
    return (
      <PublicLayout>
        <div className="mp-blog-post-page">
          <div className="mp-blog-post-empty">
            <h2>Post not found</h2>
            <Link to="/blog" className="mp-btn mp-btn-secondary">{t("blog_back")}</Link>
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="mp-blog-post-page">
        {post.cover_image && (
          <div className="mp-blog-post-cover">
            <img src={post.cover_image} alt={post.title} />
          </div>
        )}
        <article className="mp-blog-post-article">
          <Link to="/blog" className="mp-blog-post-back">{t("blog_back")}</Link>
          <h1>{post.title}</h1>
          <div className="mp-blog-post-meta">
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
          <div className="mp-blog-post-body" dangerouslySetInnerHTML={{ __html: post.content }} />
        </article>
      </div>
    </PublicLayout>
  );
}
