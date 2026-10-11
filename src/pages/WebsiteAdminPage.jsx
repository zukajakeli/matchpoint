import React, { useCallback, useEffect, useState } from "react";
import {
  fetchHeroSlides,
  saveHeroSlide,
  deleteHeroSlide,
  fetchGalleryImages,
  addGalleryImages,
  updateGalleryImage,
  deleteGalleryImage,
  saveOrder,
  fetchSiteContent,
  saveSiteContent,
  fetchCorporateInquiries,
  deleteCorporateInquiry,
} from "../services/supabase/siteContentApi";
import {
  DEFAULT_CONTACT,
  DEFAULT_CORPORATE,
  DEFAULT_HERO_IMAGE,
  SLIDE_KINDS,
  mergeContent,
} from "../content/siteDefaults";
import { compressImage, dataUrlKb } from "../utils/imageUpload";
import "./AdminPages.css";
import "./WebsiteAdminPage.css";

// Superadmin → Website: homepage hero slides and gallery, the corporate
// events page text, contact details and the inquiries sent from it.
// (Which services appear on the homepage is set on the Products page.)

const TABS = [
  ["slides", "Hero slides"],
  ["gallery", "Gallery"],
  ["corporate", "Corporate page"],
  ["contact", "Contact info"],
  ["inquiries", "Inquiries"],
];

const POSITIONS = [
  ["center", "Center"],
  ["center top", "Top"],
  ["center bottom", "Bottom"],
  ["left center", "Left"],
  ["right center", "Right"],
  ["left top", "Top left"],
  ["right top", "Top right"],
  ["left bottom", "Bottom left"],
  ["right bottom", "Bottom right"],
];

const LINK_SUGGESTIONS = ["/#services", "/book", "/events", "/corporate-events", "/contact", "/blog", "/account"];

function errorText(err) {
  const msg = err?.message || String(err);
  if (/relation .* does not exist|schema cache/i.test(msg)) {
    return "The website tables are missing. Run supabase/migrations/2026-10-11_homepage_cms.sql in the Supabase SQL editor.";
  }
  return msg;
}

function Notice({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div className={`wa-notice ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
      <span>{notice.text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss">×</button>
    </div>
  );
}

function move(list, index, delta) {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function OrderButtons({ index, length, onMove }) {
  return (
    <span className="wa-order">
      <button type="button" className="admin-btn admin-btn-sm" disabled={index === 0} onClick={() => onMove(index, -1)} aria-label="Move up">↑</button>
      <button type="button" className="admin-btn admin-btn-sm" disabled={index === length - 1} onClick={() => onMove(index, 1)} aria-label="Move down">↓</button>
    </span>
  );
}

function BilingualField({ label, value, onChange, textarea = false, rows = 3, placeholder }) {
  const Tag = textarea ? "textarea" : "input";
  return (
    <div className="admin-field">
      <label>{label}</label>
      <div className="wa-bilingual">
        <div>
          <span className="wa-lang">GE</span>
          <Tag type="text" rows={textarea ? rows : undefined} value={value?.ka || ""} placeholder={placeholder?.ka} onChange={(e) => onChange({ ...value, ka: e.target.value })} />
        </div>
        <div>
          <span className="wa-lang">EN</span>
          <Tag type="text" rows={textarea ? rows : undefined} value={value?.en || ""} placeholder={placeholder?.en} onChange={(e) => onChange({ ...value, en: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

// ── Hero slides ──────────────────────────────────────────────────────
const EMPTY_SLIDE = {
  kind: "custom",
  title_ka: "",
  title_en: "",
  subtitle_ka: "",
  subtitle_en: "",
  cta_ka: "",
  cta_en: "",
  link_url: "",
  image: null,
  image_alt: "",
  image_position: "center",
  is_active: true,
};

function SlideForm({ initial, onSave, onCancel, busy }) {
  const [slide, setSlide] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const set = (patch) => setSlide((s) => ({ ...s, ...patch }));
  const pair = (field) => ({ ka: slide[`${field}_ka`], en: slide[`${field}_en`] });
  const setPair = (field) => (v) => set({ [`${field}_ka`]: v.ka, [`${field}_en`]: v.en });

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      set({ image: await compressImage(file, { maxSize: 2400, quality: 0.82 }) });
    } catch (err) {
      setUploadError(err.message);
    }
    setUploading(false);
  };

  const preview = slide.image || (slide.kind === "events" ? null : DEFAULT_HERO_IMAGE);
  const kb = dataUrlKb(slide.image);

  return (
    <form
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(slide);
      }}
    >
      <h3>{slide.id ? "Edit slide" : "Add slide"}</h3>

      <div className="admin-field-row admin-field-row-2">
        <div className="admin-field">
          <label>Slide type</label>
          <select
            value={slide.kind}
            onChange={(e) => {
              const kind = e.target.value;
              set({ kind, link_url: slide.link_url || SLIDE_KINDS[kind].link });
            }}
          >
            {Object.entries(SLIDE_KINDS).map(([key, info]) => (
              <option key={key} value={key}>{info.label}</option>
            ))}
          </select>
          {slide.kind === "events" && (
            <span className="admin-image-hint">Shows the next upcoming event's title and date automatically. Without an image of its own it uses that event's photo.</span>
          )}
        </div>
        <div className="admin-field">
          <label>Link (button and slide click)</label>
          <input type="text" list="wa-link-suggestions" value={slide.link_url || ""} onChange={(e) => set({ link_url: e.target.value })} placeholder="/book or https://…" />
          <datalist id="wa-link-suggestions">
            {LINK_SUGGESTIONS.map((l) => <option key={l} value={l} />)}
          </datalist>
        </div>
      </div>

      <BilingualField label={slide.kind === "events" ? "Small label above the event title" : "Title"} value={pair("title")} onChange={setPair("title")} />
      <BilingualField label="Description (optional)" value={pair("subtitle")} onChange={setPair("subtitle")} textarea rows={2} />
      <BilingualField label="Button text (optional — without it the whole slide is still a link)" value={pair("cta")} onChange={setPair("cta")} />

      <div className="admin-field">
        <label>Background image</label>
        <input type="file" accept="image/*" onChange={onFile} disabled={uploading} />
        <span className="admin-image-hint">
          Recommended 2400 × 1350 px or larger, landscape. Keep the subject near the middle: phones show a narrower crop. Uploads are resized and compressed automatically.
          {kb ? ` Stored size ≈ ${kb} KB.` : ""}
        </span>
        {uploading && <span className="admin-image-hint">Compressing…</span>}
        {uploadError && <span className="wa-error-text">{uploadError}</span>}
        {slide.image === DEFAULT_HERO_IMAGE && (
          <span className="wa-placeholder-tag">Temporary placeholder: the shared venue photo. Upload this slide's own image.</span>
        )}
        {preview ? (
          <div className="wa-slide-previews">
            <div className="wa-preview-desktop" title="Desktop crop">
              <img src={preview} alt="" style={{ objectPosition: slide.image_position }} />
              <span>Desktop</span>
            </div>
            <div className="wa-preview-mobile" title="Phone crop">
              <img src={preview} alt="" style={{ objectPosition: slide.image_position }} />
              <span>Phone</span>
            </div>
          </div>
        ) : (
          <p className="admin-image-hint">No image: the next event's photo (or the venue photo) is used.</p>
        )}
        {slide.image && (
          <button type="button" className="admin-btn admin-btn-sm" onClick={() => set({ image: null })}>Remove image</button>
        )}
      </div>

      <div className="admin-field-row admin-field-row-2">
        <div className="admin-field">
          <label>Image focus (what stays visible when cropped)</label>
          <select value={slide.image_position} onChange={(e) => set({ image_position: e.target.value })}>
            {POSITIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="admin-field">
          <label>Image description (alt text, for screen readers and Google)</label>
          <input type="text" value={slide.image_alt || ""} onChange={(e) => set({ image_alt: e.target.value })} placeholder="e.g. Players at the tournament final" />
        </div>
      </div>

      <label className="wa-check">
        <input type="checkbox" checked={slide.is_active} onChange={(e) => set({ is_active: e.target.checked })} /> Show on the website
      </label>

      <div className="admin-actions">
        <button type="submit" className="admin-btn admin-btn-primary" disabled={busy || uploading}>
          {busy ? "Saving…" : slide.id ? "Save changes" : "Add slide"}
        </button>
        <button type="button" className="admin-btn admin-btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function SlidesTab({ setNotice }) {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSlides(await fetchHeroSlides({ includeInactive: true, withImages: true }));
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
    setLoading(false);
  }, [setNotice]);

  useEffect(() => { load(); }, [load]);

  const onSave = async (slide) => {
    setBusy(true);
    const { id } = slide;
    const fields = Object.fromEntries(Object.keys(EMPTY_SLIDE).map((key) => [key, slide[key]]));
    try {
      if (!id) fields.display_order = slides.length;
      await saveHeroSlide(id, fields);
      setEditing(null);
      setNotice({ type: "success", text: "Slide saved." });
      await load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
    setBusy(false);
  };

  const onMove = async (index, delta) => {
    const next = move(slides, index, delta);
    setSlides(next);
    try {
      await saveOrder("hero_slides", next.map((s) => s.id));
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
      load();
    }
  };

  const onToggle = async (slide) => {
    try {
      await saveHeroSlide(slide.id, { is_active: !slide.is_active });
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  const onDelete = async (slide) => {
    if (!confirm("Delete this slide?")) return;
    try {
      await deleteHeroSlide(slide.id);
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  if (editing) {
    return <SlideForm initial={editing} onSave={onSave} onCancel={() => setEditing(null)} busy={busy} />;
  }

  return (
    <>
      <p className="wa-intro">Slides rotate every 5 seconds in this order. Hidden slides stay saved but aren't shown. With no visible slides the site shows its built-in default slides.</p>
      <button type="button" className="admin-btn admin-btn-primary" onClick={() => setEditing({ ...EMPTY_SLIDE })} style={{ marginBottom: 20 }}>
        + Add slide
      </button>
      {loading ? (
        <p>Loading…</p>
      ) : slides.length === 0 ? (
        <p className="admin-empty">No slides yet.</p>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr><th>Order</th><th>Image</th><th>Slide</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {slides.map((slide, i) => (
                <tr key={slide.id}>
                  <td><OrderButtons index={i} length={slides.length} onMove={onMove} /></td>
                  <td>
                    {slide.image ? (
                      <img src={slide.image} alt="" className="wa-thumb-wide" style={{ objectPosition: slide.image_position }} />
                    ) : (
                      <span className="wa-muted">{slide.kind === "events" ? "Event photo" : "Venue photo"}</span>
                    )}
                    {slide.image === DEFAULT_HERO_IMAGE && <div className="wa-placeholder-tag small">Placeholder</div>}
                  </td>
                  <td>
                    <strong>{slide.title_ka || slide.title_en || "(no title)"}</strong>
                    <br />
                    <small className="wa-muted">{SLIDE_KINDS[slide.kind]?.label} · {slide.link_url || "/"}</small>
                  </td>
                  <td>
                    <button type="button" onClick={() => onToggle(slide)} className={`admin-status-badge ${slide.is_active ? "active" : "inactive"}`}>
                      {slide.is_active ? "Visible" : "Hidden"}
                    </button>
                  </td>
                  <td>
                    <button type="button" onClick={() => setEditing({ ...EMPTY_SLIDE, ...slide })} className="admin-btn admin-btn-sm">Edit</button>
                    <button type="button" onClick={() => onDelete(slide)} className="admin-btn admin-btn-sm admin-btn-danger">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Gallery ──────────────────────────────────────────────────────────
function GalleryCard({ image, index, length, onMove, onChange, onDelete }) {
  const [alt, setAlt] = useState({ ka: image.alt_ka || "", en: image.alt_en || "" });
  const dirty = alt.ka !== (image.alt_ka || "") || alt.en !== (image.alt_en || "");
  return (
    <li className={`wa-gallery-card ${image.is_active ? "" : "is-hidden"}`}>
      <img src={image.image} alt={alt.en || alt.ka || ""} />
      <div className="wa-gallery-body">
        <input type="text" placeholder="Description (GE)" value={alt.ka} onChange={(e) => setAlt({ ...alt, ka: e.target.value })} />
        <input type="text" placeholder="Description (EN)" value={alt.en} onChange={(e) => setAlt({ ...alt, en: e.target.value })} />
        <div className="wa-gallery-actions">
          <OrderButtons index={index} length={length} onMove={onMove} />
          {dirty && (
            <button type="button" className="admin-btn admin-btn-sm admin-btn-primary" onClick={() => onChange(image, { alt_ka: alt.ka, alt_en: alt.en })}>Save</button>
          )}
          <button type="button" className={`admin-status-badge ${image.is_active ? "active" : "inactive"}`} onClick={() => onChange(image, { is_active: !image.is_active })}>
            {image.is_active ? "Visible" : "Hidden"}
          </button>
          <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => onDelete(image)}>Delete</button>
        </div>
      </div>
    </li>
  );
}

function GalleryTab({ setNotice }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);

  const load = useCallback(async () => {
    try {
      setImages(await fetchGalleryImages({ includeInactive: true, withImages: true }));
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
    setLoading(false);
  }, [setNotice]);

  useEffect(() => { load(); }, [load]);

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    let added = 0;
    try {
      for (const [i, file] of files.entries()) {
        setProgress(`Uploading ${i + 1} of ${files.length}…`);
        const image = await compressImage(file, { maxSize: 1920, quality: 0.8 });
        // One insert per photo keeps each request small.
        await addGalleryImages([{ image, display_order: images.length + i }]);
        added += 1;
      }
      setNotice({ type: "success", text: `${added} photo${added === 1 ? "" : "s"} added. Add a short description to each for accessibility and SEO.` });
    } catch (err) {
      setNotice({ type: "error", text: `${added} added, then: ${errorText(err)}` });
    }
    setProgress(null);
    load();
  };

  const onMove = async (index, delta) => {
    const next = move(images, index, delta);
    setImages(next);
    try {
      await saveOrder("gallery_images", next.map((img) => img.id));
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
      load();
    }
  };

  const onChange = async (image, fields) => {
    try {
      await updateGalleryImage(image.id, fields);
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  const onDelete = async (image) => {
    if (!confirm("Delete this photo?")) return;
    try {
      await deleteGalleryImage(image.id);
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  return (
    <>
      <p className="wa-intro">Photos of the venue for the homepage gallery: playing areas, interior, VIP zone, bar, people playing, tournaments. The section is hidden until at least one photo is visible.</p>
      <div className="admin-field">
        <label className="admin-btn admin-btn-primary wa-upload">
          + Add photos
          <input type="file" accept="image/*" multiple onChange={onFiles} disabled={!!progress} hidden />
        </label>
        <span className="admin-image-hint">Landscape photos look best (4:3). You can select several at once; each is resized to 1920 px and compressed.</span>
        {progress && <span className="admin-image-hint">{progress}</span>}
      </div>
      {loading ? (
        <p>Loading…</p>
      ) : images.length === 0 ? (
        <p className="admin-empty">No photos yet.</p>
      ) : (
        <ul className="wa-gallery-grid">
          {images.map((image, i) => (
            <GalleryCard key={`${image.id}-${image.updated_at}`} image={image} index={i} length={images.length} onMove={onMove} onChange={onChange} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </>
  );
}

// ── Corporate page + contact ─────────────────────────────────────────
function useSiteContent(key, defaults, setNotice) {
  const [value, setValue] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSiteContent([key])
      .then((saved) => setValue(mergeContent(defaults, saved[key])))
      .catch((err) => {
        setNotice({ type: "error", text: errorText(err) });
        setValue(defaults);
      });
  }, [key, defaults, setNotice]);

  const save = async () => {
    setSaving(true);
    try {
      await saveSiteContent(key, value);
      setNotice({ type: "success", text: "Saved. The website shows the new text right away." });
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
    setSaving(false);
  };

  return [value, setValue, save, saving];
}

function CorporateTab({ setNotice }) {
  const [content, setContent, save, saving] = useSiteContent("corporate", DEFAULT_CORPORATE, setNotice);
  if (!content) return <p>Loading…</p>;

  const options = content.options || [];
  const setOptions = (next) => setContent({ ...content, options: next });
  const setOption = (i, patch) => setOptions(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  return (
    <form className="admin-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <h3>Corporate events page · /corporate-events</h3>
      <BilingualField label="Introduction heading" value={content.intro_title} onChange={(v) => setContent({ ...content, intro_title: v })} />
      <BilingualField label="Introduction text (empty lines start a new paragraph)" value={content.intro_text} onChange={(v) => setContent({ ...content, intro_text: v })} textarea rows={5} />

      <h3 className="wa-subhead">Event options</h3>
      {options.map((option, i) => (
        <fieldset key={i} className="wa-option">
          <legend>Option {i + 1}</legend>
          <div className="admin-field wa-icon-field">
            <label>Icon (emoji)</label>
            <input type="text" value={option.icon || ""} maxLength={4} onChange={(e) => setOption(i, { icon: e.target.value })} />
          </div>
          <BilingualField label="Title" value={option.title} onChange={(v) => setOption(i, { title: v })} />
          <BilingualField label="Description" value={option.text} onChange={(v) => setOption(i, { text: v })} textarea rows={2} />
          <div className="wa-option-actions">
            <OrderButtons index={i} length={options.length} onMove={(index, delta) => setOptions(move(options, index, delta))} />
            <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => setOptions(options.filter((_, j) => j !== i))}>Remove</button>
          </div>
        </fieldset>
      ))}
      <button type="button" className="admin-btn admin-btn-sm" onClick={() => setOptions([...options, { icon: "⭐", title: { ka: "", en: "" }, text: { ka: "", en: "" } }])}>
        + Add option
      </button>

      <div className="admin-actions">
        <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>{saving ? "Saving…" : "Save page"}</button>
        <button type="button" className="admin-btn admin-btn-secondary" onClick={() => confirm("Replace the form with the original text? (Nothing is saved until you press Save.)") && setContent(DEFAULT_CORPORATE)}>
          Reset to default text
        </button>
      </div>
    </form>
  );
}

function ContactTab({ setNotice }) {
  const [contact, setContact, save, saving] = useSiteContent("contact", DEFAULT_CONTACT, setNotice);
  if (!contact) return <p>Loading…</p>;
  return (
    <form className="admin-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <h3>Contact details on the corporate events page</h3>
      <div className="admin-field-row admin-field-row-2">
        <div className="admin-field">
          <label>Phone</label>
          <input type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} required />
        </div>
        <div className="admin-field">
          <label>Email</label>
          <input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} required />
        </div>
      </div>
      <BilingualField label="Address" value={contact.address} onChange={(v) => setContact({ ...contact, address: v })} />
      <p className="admin-image-hint">Inquiry emails are delivered to the address set on the server (INQUIRY_EMAIL_TO), not this one.</p>
      <div className="admin-actions">
        <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>{saving ? "Saving…" : "Save contact details"}</button>
      </div>
    </form>
  );
}

// ── Inquiries ────────────────────────────────────────────────────────
function InquiriesTab({ setNotice }) {
  const [rows, setRows] = useState(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchCorporateInquiries());
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
      setRows([]);
    }
  }, [setNotice]);

  useEffect(() => { load(); }, [load]);

  const onDelete = async (row) => {
    if (!confirm(`Delete the inquiry from ${row.full_name}?`)) return;
    try {
      await deleteCorporateInquiry(row.id);
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  if (!rows) return <p>Loading…</p>;
  if (!rows.length) return <p className="admin-empty">No inquiries yet. They also arrive by email.</p>;

  return (
    <div className="admin-table-wrapper">
      <table className="admin-table wa-inquiries">
        <thead>
          <tr><th>Received</th><th>From</th><th>Event</th><th>Message</th><th>Email</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{new Date(row.created_at).toLocaleString("en-GB", { timeZone: "Asia/Tbilisi", dateStyle: "medium", timeStyle: "short" })}</td>
              <td>
                <strong>{row.full_name}</strong>
                {row.company && <><br /><small>{row.company}</small></>}
                <br /><a href={`mailto:${row.email}`}>{row.email}</a>
                <br /><a href={`tel:${row.phone.replace(/[^\d+]/g, "")}`}>{row.phone}</a>
              </td>
              <td>
                {row.event_date || "—"}
                <br /><small>{row.participants ? `${row.participants} people` : ""}</small>
              </td>
              <td className="wa-message">{row.message}</td>
              <td>
                {row.email_sent_at ? (
                  <span className="admin-status-badge active">Sent</span>
                ) : (
                  <span className="admin-status-badge inactive" title={row.email_error || ""}>Not sent</span>
                )}
              </td>
              <td><button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => onDelete(row)}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function WebsiteAdminPage() {
  const [tab, setTab] = useState("slides");
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (notice?.type !== "success") return undefined;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <div className="admin-page">
      <h2>Website</h2>
      <div className="wa-tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`wa-tab ${tab === key ? "active" : ""}`}
            onClick={() => {
              setTab(key);
              setNotice(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      {tab === "slides" && <SlidesTab setNotice={setNotice} />}
      {tab === "gallery" && <GalleryTab setNotice={setNotice} />}
      {tab === "corporate" && <CorporateTab setNotice={setNotice} />}
      {tab === "contact" && <ContactTab setNotice={setNotice} />}
      {tab === "inquiries" && <InquiriesTab setNotice={setNotice} />}
    </div>
  );
}
