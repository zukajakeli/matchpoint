import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../../services/supabaseClient";
import { useTranslation } from "../../i18n/LanguageContext";
import PublicLayout from "../../components/landing/PublicLayout";
import "./ProductDetailPage.css";

export default function ProductDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !id) return;
    supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (!error) setProduct(data);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <PublicLayout>
        <div className="mp-product-detail-page">
          <div className="mp-product-detail-loading">{t("loading")}</div>
        </div>
      </PublicLayout>
    );
  }

  if (!product) {
    return (
      <PublicLayout>
        <div className="mp-product-detail-page">
          <div className="mp-product-detail-empty">
            <h2>{t("services_not_found")}</h2>
            <Link to="/" className="mp-btn mp-btn-secondary">{t("back_home")}</Link>
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="mp-product-detail-page">
        <div className="mp-product-detail-hero">
          {product.image && (
            <div className="mp-product-detail-image">
              <img src={product.image} alt={product.title} />
            </div>
          )}
          <div className="mp-product-detail-content">
            <Link to="/#services" className="mp-product-back-link">{t("services_back")}</Link>
            <h1>{product.title}</h1>
            {product.subtitle && <p className="mp-product-detail-subtitle">{product.subtitle}</p>}
            {product.description && (
              <div className="mp-product-detail-desc" dangerouslySetInnerHTML={{ __html: product.description }} />
            )}
            <Link to="/book" className="mp-btn mp-btn-primary" style={{ marginTop: "24px" }}>
              {t("services_book_now")}
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
