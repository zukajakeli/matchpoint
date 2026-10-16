import React, { useCallback, useEffect, useState } from "react";
import {
  fetchWcSlotsAdmin,
  createWcSlot,
  updateWcSlot,
  deleteWcSlot,
  fetchWcApplications,
  adminAddWcApplicant,
  moveWcApplicant,
  removeWcApplicant,
  wcErrorCode,
  WC_DEFAULT_CAPACITY,
  WC_LEVELS,
} from "../services/supabase/womensClubApi";
import { hhmm, slotTime, validateWcForm, weekdayName } from "../utils/womensClub";
import { formatPhone } from "../utils/memberAnalytics";
import { supabase } from "../services/supabaseClient";
import { SITE } from "../seo/seo";
import "./AdminPages.css";
import "./WomensClubAdminPage.css";

// Staff portal → Women's Club. Fixed weekly time slots; each woman applies
// once for one of them. Applications are kept on their own, separate from
// club membership. Staff can see the slots and lists; only the superadmin
// can change them (enforced by RLS and the wc_* database functions).

const SHARE_URL = `${SITE.url}/womens-club`;
const LEVEL_LABELS = {
  never: "Complete beginner",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
const ERRORS = {
  NOT_ALLOWED: "Only the superadmin can change the women's club.",
  SLOT_FULL: "This time slot is full. Raise its capacity first.",
  ALREADY_APPLIED: "Someone with this phone number or email has already applied.",
  INVALID_PHONE: "Enter a valid phone number.",
  INVALID_EMAIL: "Enter a valid email address.",
  NAME_REQUIRED: "First and last name are required.",
  INVALID_LEVEL: "Choose a playing level.",
};
const label = (slot) => `${weekdayName(slot.weekday, "en")} ${slotTime(slot)}`;

function errorText(err) {
  const msg = err?.message || String(err);
  if (/wc_slots|wc_applications|wc_admin|wc_slot_list/.test(msg) && /does not exist|schema cache|Could not find/i.test(msg)) {
    return "The women's club tables are missing. Run supabase/migrations/2026-10-17_womens_club_slots.sql in the Supabase SQL editor.";
  }
  if (err?.code === "23503") return "This time slot still has applicants. Move or remove them first.";
  return ERRORS[wcErrorCode(err)] || msg;
}

function toCsv(rows, slotsById) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      slotsById[r.slot_id] ? label(slotsById[r.slot_id]) : "",
      r.first_name, r.last_name, formatPhone(r.phone), r.email, LEVEL_LABELS[r.level],
      r.source, r.created_at?.slice(0, 16).replace("T", " "),
    ].map(esc).join(",")
  );
  return "﻿" + ["Time slot,First name,Last name,Phone,Email,Level,Member ID,Source,Applied (UTC)", ...lines].join("\r\n");
}

function download(name, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function SlotFields({ draft, setDraft }) {
  return (
    <>
      <label>
        Day
        <select value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{weekdayName(d, "en")}</option>)}
        </select>
      </label>
      <label>From<input type="time" value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} required /></label>
      <label>To<input type="time" value={draft.end_time} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} required /></label>
      <label>Places<input type="number" min={1} max={500} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} required /></label>
    </>
  );
}

// ── Applicants of one slot ───────────────────────────────────────────
const EMPTY_PERSON = { firstName: "", lastName: "", phone: "", email: "", level: "never" };

function Applicants({ slot, slots, canEdit, onChanged, setNotice }) {
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [person, setPerson] = useState(EMPTY_PERSON);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await fetchWcApplications(slot.id));
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
      setRows([]);
    }
  }, [slot.id, setNotice]);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    const errors = validateWcForm(person, { requireEmail: false, requireSlot: false });
    const first = Object.keys(errors)[0];
    if (first) {
      const code = { firstName: "NAME_REQUIRED", lastName: "NAME_REQUIRED", phone: "INVALID_PHONE", email: "INVALID_EMAIL", level: "INVALID_LEVEL" }[first];
      return setNotice({ type: "error", text: ERRORS[code] });
    }
    setBusy(true);
    try {
      await adminAddWcApplicant(slot.id, person);
      setPerson(EMPTY_PERSON);
      setAdding(false);
      setNotice({ type: "success", text: "Added." });
      await load();
      onChanged();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
    setBusy(false);
  };

  const move = async (row, slotId) => {
    if (!slotId) return;
    try {
      await moveWcApplicant(row.id, slotId);
      setNotice({ type: "success", text: `${row.first_name} moved to ${label(slots.find((s) => s.id === slotId))}.` });
      await load();
      onChanged();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  const remove = async (row) => {
    if (!confirm(`Remove ${row.first_name} ${row.last_name}'s application? Her place becomes free and she can apply again.`)) return;
    try {
      await removeWcApplicant(row.id);
      await load();
      onChanged();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  if (!rows) return <p className="wcA-muted wcA-pad">Loading…</p>;

  return (
    <div className="wcA-participants">
      <div className="wcA-participants-bar">
        <strong>{rows.length} applied</strong>
        <span>
          {rows.length > 0 && (
            <button type="button" className="admin-btn admin-btn-sm" onClick={() => download(`womens-club-${weekdayName(slot.weekday, "en").toLowerCase()}-${hhmm(slot.start_time).replace(":", "")}.csv`, toCsv(rows, { [slot.id]: slot }))}>
              Export CSV
            </button>
          )}
          {canEdit && !adding && <button type="button" className="admin-btn admin-btn-sm admin-btn-primary" onClick={() => setAdding(true)}>+ Add person</button>}
        </span>
      </div>

      {adding && (
        <form className="wcA-add" onSubmit={add}>
          <input placeholder="First name" value={person.firstName} onChange={(e) => setPerson({ ...person, firstName: e.target.value })} required />
          <input placeholder="Last name" value={person.lastName} onChange={(e) => setPerson({ ...person, lastName: e.target.value })} required />
          <input placeholder="Phone" type="tel" value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} required />
          <input placeholder="Email (optional)" type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} />
          <select value={person.level} onChange={(e) => setPerson({ ...person, level: e.target.value })} aria-label="Level">
            {WC_LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
          </select>
          <span className="wcA-add-actions">
            <button type="submit" className="admin-btn admin-btn-sm admin-btn-primary" disabled={busy}>{busy ? "Adding…" : "Add"}</button>
            <button type="button" className="admin-btn admin-btn-sm" onClick={() => setAdding(false)}>Cancel</button>
          </span>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="wcA-muted wcA-pad">Nobody has applied for this time yet.</p>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr><th>#</th><th>Name</th><th>Phone</th><th>Email</th><th>Level</th><th>Applied</th>{canEdit && <th />}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td><strong>{r.first_name} {r.last_name}</strong>{r.source === "admin" && <span className="wcA-tag">added by admin</span>}</td>
                  <td className="nowrap"><a href={`tel:+${r.phone}`}>{formatPhone(r.phone)}</a></td>
                  <td>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : "—"}</td>
                  <td><span className={`wcA-level lv-${r.level}`}>{LEVEL_LABELS[r.level]}</span></td>
                  <td className="nowrap">{new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Tbilisi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  {canEdit && (
                    <td className="nowrap">
                      <select value="" onChange={(e) => move(r, e.target.value)} aria-label="Move to another time" className="wcA-move">
                        <option value="">Move to…</option>
                        {slots.filter((s) => s.id !== slot.id).map((s) => (
                          <option key={s.id} value={s.id} disabled={s.taken >= s.capacity}>
                            {label(s)}{s.taken >= s.capacity ? " (full)" : ""}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => remove(r)}>Remove</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── One slot ─────────────────────────────────────────────────────────
function SlotRow({ slot, slots, canEdit, onChanged, setNotice }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    weekday: slot.weekday,
    start_time: hhmm(slot.start_time),
    end_time: hhmm(slot.end_time),
    capacity: slot.capacity,
  });
  const full = slot.taken >= slot.capacity;
  const status = !slot.is_open ? "Closed" : full ? "Full" : "Open";
  const pct = Math.min(100, Math.round((slot.taken / slot.capacity) * 100));

  const save = async (e) => {
    e.preventDefault();
    try {
      await updateWcSlot(slot.id, { ...draft, capacity: Number(draft.capacity), display_order: draft.weekday });
      setEditing(false);
      setNotice({ type: "success", text: "Time slot updated." });
      onChanged();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  const toggleOpen = async () => {
    try {
      await updateWcSlot(slot.id, { is_open: !slot.is_open });
      onChanged();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  const remove = async () => {
    if (slot.taken) return setNotice({ type: "error", text: "This time slot still has applicants. Move or remove them first." });
    if (!confirm(`Delete ${label(slot)}?`)) return;
    try {
      await deleteWcSlot(slot.id);
      onChanged();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  return (
    <li className={`wcA-session st-${status.toLowerCase()}`}>
      <div className="wcA-session-main">
        <button type="button" className="wcA-session-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="wcA-when">
            <strong>{weekdayName(slot.weekday, "en")}</strong>
            <span className="wcA-time">{slotTime(slot)}</span>
          </span>
          <span className="wcA-capacity">
            <span className="wcA-bar"><span style={{ width: `${pct}%` }} /></span>
            <span>{slot.taken} / {slot.capacity}</span>
          </span>
          <span className={`wcA-status st-${status.toLowerCase()}`}>{status}</span>
          <span className="wcA-chevron" aria-hidden="true">{open ? "▴" : "▾"}</span>
        </button>
        {canEdit && (
          <span className="wcA-actions">
            <button type="button" className="admin-btn admin-btn-sm" onClick={() => setEditing((v) => !v)}>Edit</button>
            <button type="button" className="admin-btn admin-btn-sm" onClick={toggleOpen} title={slot.is_open ? "Stop new applications from the website" : "Accept applications again"}>
              {slot.is_open ? "Close" : "Reopen"}
            </button>
            <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={remove}>Delete</button>
          </span>
        )}
      </div>
      {editing && (
        <form className="wcA-edit" onSubmit={save}>
          <SlotFields draft={draft} setDraft={setDraft} />
          {Number(draft.capacity) < slot.taken && (
            <p className="wcA-error-text wide">{slot.taken} people have already applied; a lower capacity won't remove anyone, it only stops new applications.</p>
          )}
          <span className="wcA-add-actions">
            <button type="submit" className="admin-btn admin-btn-sm admin-btn-primary">Save</button>
            <button type="button" className="admin-btn admin-btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </span>
        </form>
      )}
      {open && <Applicants slot={slot} slots={slots} canEdit={canEdit} onChanged={onChanged} setNotice={setNotice} />}
    </li>
  );
}

// ── Page ─────────────────────────────────────────────────────────────
export default function WomensClubAdminPage({ isSuperadmin }) {
  const [slots, setSlots] = useState(null);
  const [notice, setNotice] = useState(null);
  const [copied, setCopied] = useState(false);
  const [newSlot, setNewSlot] = useState(null);

  const load = useCallback(async () => {
    try {
      setSlots(await fetchWcSlotsAdmin());
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
      setSlots([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (notice?.type !== "success") return undefined;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", SHARE_URL);
    }
  };

  const addSlot = async (e) => {
    e.preventDefault();
    try {
      await createWcSlot({ ...newSlot, capacity: Number(newSlot.capacity), display_order: newSlot.weekday });
      setNewSlot(null);
      setNotice({ type: "success", text: "Time slot added." });
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  const exportAll = async () => {
    try {
      const { data, error } = await supabase
        .from("wc_applications")
        .select("slot_id, first_name, last_name, phone, email, level, source, created_at")
        .order("created_at");
      if (error) throw error;
      download("womens-club-applications.csv", toCsv(data || [], Object.fromEntries(slots.map((s) => [s.id, s]))));
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  const total = (slots || []).reduce((sum, s) => sum + s.taken, 0);
  const capacity = (slots || []).reduce((sum, s) => sum + s.capacity, 0);

  return (
    <div className="admin-page wcA">
      <h2>Women's Club</h2>
      <div className="wcA-card wcA-share">
        <div>
          <h3>Application link</h3>
          <p className="wcA-muted">Share it in the WhatsApp group. The page isn't in the menus, the sitemap or search engines.</p>
        </div>
        <div className="wcA-link">
          <code>{SHARE_URL}</code>
          <button type="button" className="admin-btn admin-btn-sm admin-btn-primary" onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</button>
          <a className="admin-btn admin-btn-sm" href="/womens-club" target="_blank" rel="noopener noreferrer">Open</a>
        </div>
      </div>

      {notice && (
        <div className={`wcA-notice ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="wcA-list-head">
        <h3>Time slots <span className="wcA-muted">· {total} of {capacity} places taken</span></h3>
        <span>
          {total > 0 && <button type="button" className="admin-btn admin-btn-sm" onClick={exportAll}>Export all CSV</button>}
          {isSuperadmin && !newSlot && (
            <button type="button" className="admin-btn admin-btn-sm" onClick={() => setNewSlot({ weekday: 1, start_time: "19:30", end_time: "21:00", capacity: WC_DEFAULT_CAPACITY })}>
              + Add time slot
            </button>
          )}
        </span>
      </div>
      <p className="wcA-muted wcA-hint">Each person can apply once, for one time slot. Removing someone frees her place and lets her apply again.</p>

      {newSlot && (
        <form className="wcA-card wcA-edit" onSubmit={addSlot}>
          <SlotFields draft={newSlot} setDraft={setNewSlot} />
          <span className="wcA-add-actions">
            <button type="submit" className="admin-btn admin-btn-sm admin-btn-primary">Add</button>
            <button type="button" className="admin-btn admin-btn-sm" onClick={() => setNewSlot(null)}>Cancel</button>
          </span>
        </form>
      )}

      {slots === null ? (
        <p className="wcA-muted">Loading…</p>
      ) : slots.length === 0 ? (
        <p className="admin-empty">No time slots yet.</p>
      ) : (
        <ul className="wcA-slots">
          {slots.map((s) => (
            <SlotRow
              key={`${s.id}-${s.weekday}-${s.start_time}-${s.end_time}-${s.capacity}`}
              slot={s}
              slots={slots}
              canEdit={isSuperadmin}
              onChanged={load}
              setNotice={setNotice}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
