import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { fetchBlogPosts, createBlogPost, updateBlogPost, deleteBlogPost } from "../services/supabase/blogApi";
import "./AdminPages.css";

// Lazy load ReactQuill so it doesn't break if not yet installed
let ReactQuill;
try {
  ReactQuill = lazy(() => import("react-quill-new"));
} catch {
  ReactQuill = null;
}

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ color: [] }, { background: [] }],
    [{ list: "ordered" }, { list: "bullet" }],
    ["blockquote", "code-block"],
    ["link", "image"],
    ["clean"],
  ],
};

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export default function BlogAdminPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showEditor, setShowEditor] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [isPublished, setIsPublished] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchBlogPosts(false);
      setPosts(data);
    } catch (e) {
      console.error("Failed to load posts:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setShowEditor(false);
    setTitle("");
    setSlug("");
    setExcerpt("");
    setContent("");
    setCoverImage("");
    setIsPublished(false);
  };

  const handleEdit = (p) => {
    setEditingId(p.id);
    setShowEditor(true);
    setTitle(p.title);
    setSlug(p.slug);
    setExcerpt(p.excerpt || "");
    setContent(p.content || "");
    setCoverImage(p.cover_image || "");
    setIsPublished(p.is_published);
  };

  const handleTitleChange = (val) => {
    setTitle(val);
    if (!editingId) setSlug(generateSlug(val));
  };

  const handleCoverUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCoverImage(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateBlogPost(editingId, { title, slug, excerpt, content, cover_image: coverImage, is_published: isPublished });
      } else {
        await createBlogPost({ title, slug, excerpt, content, cover_image: coverImage, is_published: isPublished });
      }
      resetForm();
      load();
    } catch (err) {
      console.error("Save failed:", err);
      alert("Save failed: " + (err.message || "Unknown error"));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this blog post?")) return;
    try {
      await deleteBlogPost(id);
      load();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleTogglePublish = async (p) => {
    try {
      await updateBlogPost(p.id, { is_published: !p.is_published });
      load();
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  };

  return (
    <div className="admin-page">
      <h2>Blog Management</h2>

      {!showEditor && (
        <button onClick={() => setShowEditor(true)} className="admin-btn admin-btn-primary" style={{ marginBottom: 24 }}>
          + New Blog Post
        </button>
      )}

      {showEditor && (
        <form onSubmit={handleSubmit} className="admin-form">
          <h3>{editingId ? "Edit Post" : "New Post"}</h3>
          <div className="admin-field">
            <label>Title</label>
            <input type="text" value={title} onChange={(e) => handleTitleChange(e.target.value)} required placeholder="Post title" />
          </div>
          <div className="admin-field">
            <label>Slug (URL)</label>
            <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} required placeholder="url-friendly-slug" />
          </div>
          <div className="admin-field">
            <label>Excerpt (short summary)</label>
            <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} placeholder="Brief summary for previews..." />
          </div>
          <div className="admin-field">
            <label>Cover Image</label>
            <input type="file" accept="image/*" onChange={handleCoverUpload} />
            <span className="admin-image-hint">Recommended: 1600 × 900 px (16:9 ratio). Min 1200 × 675 px. JPG or PNG.</span>
            {coverImage && <img src={coverImage} alt="Cover" className="admin-image-preview admin-image-preview-16-9" />}
          </div>
          <div className="admin-field">
            <label>Content</label>
            {ReactQuill ? (
              <Suspense fallback={<div style={{ padding: 20, background: "#f4f5f7", borderRadius: 8 }}>Loading editor...</div>}>
                <ReactQuill
                  theme="snow"
                  value={content}
                  onChange={setContent}
                  modules={QUILL_MODULES}
                  style={{ background: "#fff", borderRadius: 8, minHeight: 300 }}
                />
              </Suspense>
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                placeholder="Write your blog post content here (HTML supported)..."
                style={{ fontFamily: "monospace" }}
              />
            )}
          </div>
          <div className="admin-field admin-field-row">
            <label>
              <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
              {" "}Publish immediately
            </label>
          </div>
          <div className="admin-actions">
            <button type="submit" className="admin-btn admin-btn-primary">
              {editingId ? "Save Changes" : "Create Post"}
            </button>
            <button type="button" onClick={resetForm} className="admin-btn admin-btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div className="admin-list">
        <h3>All Posts ({posts.length})</h3>
        {loading ? (
          <p>Loading...</p>
        ) : posts.length === 0 ? (
          <p className="admin-empty">No blog posts yet.</p>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Slug</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.title}</strong></td>
                    <td><code>/blog/{p.slug}</code></td>
                    <td>
                      <button
                        onClick={() => handleTogglePublish(p)}
                        className={`admin-status-badge ${p.is_published ? "active" : "inactive"}`}
                      >
                        {p.is_published ? "Published" : "Draft"}
                      </button>
                    </td>
                    <td>{p.published_at ? new Date(p.published_at).toLocaleDateString() : "—"}</td>
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
