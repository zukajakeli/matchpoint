import React, { useState, useEffect, useCallback } from "react";
import { fetchProducts, createProduct, updateProduct, deleteProduct } from "../services/supabase/productsApi";
import "./AdminPages.css";

export default function ProductsAdminPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form state
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (e) {
      console.error("Failed to load products:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setShowForm(false);
    setTitle("");
    setSubtitle("");
    setDescription("");
    setImage("");
    setDisplayOrder(0);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(file);
  };

  const handleEdit = (p) => {
    setEditingId(p.id);
    setShowForm(true);
    setTitle(p.title);
    setSubtitle(p.subtitle || "");
    setDescription(p.description || "");
    setImage(p.image || "");
    setDisplayOrder(p.display_order || 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateProduct(editingId, { title, subtitle, description, image, display_order: displayOrder });
      } else {
        await createProduct({ title, subtitle, description, image, display_order: displayOrder });
      }
      resetForm();
      load();
    } catch (err) {
      console.error("Save failed:", err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this product?")) return;
    try {
      await deleteProduct(id);
      load();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleToggleActive = async (p) => {
    try {
      await updateProduct(p.id, { is_active: !p.is_active });
      load();
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  };

  return (
    <div className="admin-page">
      <h2>Manage Products & Services</h2>

      {!showForm && (
        <button onClick={() => setShowForm(true)} className="admin-btn admin-btn-primary" style={{ marginBottom: 24 }}>
          + Add New Product
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="admin-form">
          <h3>{editingId ? "Edit Product" : "Add Product"}</h3>
          <div className="admin-field">
            <label>Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Table Rental" />
          </div>
          <div className="admin-field">
            <label>Subtitle</label>
            <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Short tagline" />
          </div>
          <div className="admin-field">
            <label>Description (HTML supported)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Full description..." />
          </div>
          <div className="admin-field">
            <label>Image</label>
            <input type="file" accept="image/*" onChange={handleImageUpload} />
            <span className="admin-image-hint">Recommended: 1200 × 900 px (4:3 ratio). Min 800 × 600 px. JPG or PNG.</span>
            {image && <img src={image} alt="Preview" className="admin-image-preview admin-image-preview-4-3" />}
          </div>
          <div className="admin-field">
            <label>Display Order</label>
            <input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(Number(e.target.value))} />
          </div>
          <div className="admin-actions">
            <button type="submit" className="admin-btn admin-btn-primary">
              {editingId ? "Save Changes" : "Add Product"}
            </button>
            <button type="button" onClick={resetForm} className="admin-btn admin-btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div className="admin-list">
        <h3>All Products ({products.length})</h3>
        {loading ? (
          <p>Loading...</p>
        ) : products.length === 0 ? (
          <p className="admin-empty">No products yet.</p>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Image</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>{p.display_order}</td>
                    <td>
                      {p.image && <img src={p.image} alt="" className="admin-thumb" />}
                    </td>
                    <td>
                      <strong>{p.title}</strong>
                      {p.subtitle && <br />}
                      {p.subtitle && <small>{p.subtitle}</small>}
                    </td>
                    <td>
                      <button
                        onClick={() => handleToggleActive(p)}
                        className={`admin-status-badge ${p.is_active ? "active" : "inactive"}`}
                      >
                        {p.is_active ? "Active" : "Hidden"}
                      </button>
                    </td>
                    <td>
                      <button onClick={() => handleEdit(p)} className="admin-btn admin-btn-sm">Edit</button>
                      <button onClick={() => handleDelete(p.id)} className="admin-btn admin-btn-sm admin-btn-danger">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
