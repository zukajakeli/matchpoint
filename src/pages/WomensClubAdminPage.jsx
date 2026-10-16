import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchWcSessions,
  fetchWcSlots,
  saveWcSlot,
  deleteWcSlot,
  fillWcWeek,
  createWcSessions,
  updateWcSession,
  deleteWcSession,
  fetchWcRegistrations,
  adminAddWcParticipant,
  removeWcParticipant,
  wcErrorCode,
  WC_DEFAULT_CAPACITY,
  WC_LEVELS,
} from "../services/supabase/womensClubApi";
import { isoToTbilisi, nextMonday, sessionParts, tbilisiToIso, timeRange, validateWcForm, weekdayName } from "../utils/womensClub";
import { formatPhone } from "../utils/memberAnalytics";
import { SITE } from "../seo/seo";
import "./AdminPages.css";
import "./WomensClubAdminPage.css";

// Staff portal → Women's Club: the club's own schedule, capacities and
// participant lists, separate from table bookings. Participants are club
// members (label "Women's Club"); names and contacts come from their
// member profile. Staff can view; only the superadmin can change things
// (enforced by RLS and the womens_club_* database functions).

const SHARE_URL = `${SITE.url}/womens-club`;
const LEVEL_LABELS = {
  never: "Complete beginner",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
const ERRORS = {
  NOT_ALLOWED: "Only the superadmin can change the women's club.",
  SESSION_FULL: "This session is full. Raise its capacity first to add someone.",
  ALREADY_REGISTERED: "Someone with this phone number or email is already registered for this session.",
  INVALID_PHONE: "Enter a valid phone number.",
  INVALID_EMAIL: "Enter a valid email address.",
  NAME_REQUIRED: "First and last name are required.",
  INVALID_LEVEL: "Choose a playing level.",
};

function errorText(err) {
  const msg = err?.message || String(err);
  if (/womens_club/.test(msg) && /does not exist|schema cache|Could not find/i.test(msg)) {
    return "The women's club tables are missing. Run supabase/migrations/2026-10-20_womens_club.sql in the Supabase SQL editor.";
  }
  return ERRORS[wcErrorCode(err)] || msg;
}

function weekKey(iso) {
  const { date } = isoToTbilisi(iso);
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const back = (day.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
}

function formatWeek(monday) {
  const start = new Date(`${monday}T12:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86400000);
  const f = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `Week of ${f(start)} – ${f(end)}`;
}

function csv(rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r, i) =>
    [i + 1, r.first_name, r.last_name, formatPhone(r.phone), r.email, LEVEL_LABELS[r.level], r.member_code, r.source, r.created_at?.slice(0, 16).replace("T", " ")]
      .map(esc)
      .join(",")
  );
  return "﻿" + ["#,First name,Last name,Phone,Email,Level,Member ID,Source,Registered (UTC)", ...lines].join("\r\n");
}

// ── Weekly time slots (template) ─────────────────────────────────────
const hhmm = (t) => String(t || "").slice(0, 5);

function SlotRow({ slot, canEdit, onSaved, setNotice }) {
  const [draft, setDraft] = useState({
    weekday: slot.weekday,
    start_time: hhmm(slot.start_time),
    end_time: hhmm(slot.end_time),
    capacity: slot.capacity,
    is_active: slot.is_active,
  });
  const dirty =
    draft.weekday !== slot.weekday || draft.start_time !== hhmm(slot.start_time) || draft.end_time !== hhmm(slot.end_time) ||
    Number(draft.capacity) !== slot.capacity || draft.is_active !== slot.is_active;

  const save = async () => {
    if (draft.end_time <= draft.start_time) return setNotice({ type: "error", text: "The end time must be after the start time." });
    try {
      await saveWcSlot(slot.id, { ...draft, capacity: Number(draft.capacity) });
      setNotice({ type: "success", text: "Time slot saved. It applies to weeks created from now on." });
      onSaved();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  const remove = async () => {
    if (!confirm(`Remove ${weekdayName(slot.weekday)} ${hhmm(slot.start_time)} from the weekly time slots? Sessions already created stay.`)) return;
    try {
      await deleteWcSlot(slot.id);
      onSaved();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  return (
    <tr className={draft.is_active ? "" : "wcA-inactive"}>
      <td>
        <select value={draft.weekday} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })} aria-label="Day">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{weekdayName(d)}</option>)}
        </select>
      </td>
      <td><input type="time" value={draft.start_time} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} aria-label="From" /></td>
      <td><input type="time" value={draft.end_time} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} aria-label="To" /></td>
      <td><input type="number" min={1} max={500} value={draft.capacity} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} aria-label="Places" className="wcA-num" /></td>
      <td><input type="checkbox" checked={draft.is_active} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} aria-label="Active" /></td>
      {canEdit && (
        <td className="nowrap">
          {dirty && <button type="button" className="admin-btn admin-btn-sm admin-btn-primary" onClick={save}>Save</button>}
          <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={remove}>Remove</button>
        </td>
      )}
    </tr>
  );
}

function TimeSlots({ canEdit, onWeekCreated, setNotice }) {
  const [slots, setSlots] = useState(null);
  const [monday, setMonday] = useState(nextMonday());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSlots(await fetchWcSlots());
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
      setSlots([]);
    }
  }, [setNotice]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    try {
      await saveWcSlot(null, { weekday: 1, start_time: "19:30", end_time: "21:00", capacity: WC_DEFAULT_CAPACITY });
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  const createWeek = async () => {
    setBusy(true);
    try {
      const added = await fillWcWeek(monday);
      setNotice(
        added
          ? { type: "success", text: `${added} session${added === 1 ? "" : "s"} created for the week of ${monday}.` }
          : { type: "error", text: "That week already has these sessions." }
      );
      onWeekCreated();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
    setBusy(false);
  };

  return (
    <div className="wcA-card">
      <h3>Weekly time slots</h3>
      <p className="wcA-muted">
        Every week's sessions are created from these automatically, for this week and the next. Change one session on its own below; changes here apply to weeks created afterwards.
      </p>
      {slots === null ? (
        <p className="wcA-muted">Loading…</p>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table wcA-slots">
            <thead>
              <tr><th>Day</th><th>From</th><th>To</th><th>Places</th><th>Active</th>{canEdit && <th />}</tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <SlotRow key={`${slot.id}-${slot.weekday}-${slot.start_time}-${slot.end_time}-${slot.capacity}-${slot.is_active}`} slot={slot} canEdit={canEdit} onSaved={load} setNotice={setNotice} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && (
        <div className="wcA-slot-actions">
          <button type="button" className="admin-btn admin-btn-sm" onClick={add}>+ Add time slot</button>
          <span className="wcA-fill">
            <label>
              Create a week now (Monday)
              <input type="date" value={monday} onChange={(e) => setMonday(e.target.value)} />
            </label>
            <button type="button" className="admin-btn admin-btn-sm admin-btn-primary" onClick={createWeek} disabled={busy || !monday}>
              {busy ? "Creating…" : "Create sessions"}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

// ── Participants ─────────────────────────────────────────────────────
const EMPTY_PERSON = { firstName: "", lastName: "", phone: "", email: "", level: "never" };

function Participants({ session, canEdit, clubBase, onChanged, setNotice }) {
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [person, setPerson] = useState(EMPTY_PERSON);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await fetchWcRegistrations(session.id));
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
      setRows([]);
    }
  }, [session.id, setNotice]);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    const errors = validateWcForm(person, { requireEmail: false, requireSession: false });
    if (Object.keys(errors).length) {
      return setNotice({ type: "error", text: ERRORS[{ firstName: "NAME_REQUIRED", lastName: "NAME_REQUIRED", phone: "INVALID_PHONE", email: "INVALID_EMAIL", level: "INVALID_LEVEL" }[Object.keys(errors)[0]]] });
    }
    setBusy(true);
    try {
      await adminAddWcParticipant(session.id, person);
      setPerson(EMPTY_PERSON);
      setAdding(false);
      setNotice({ type: "success", text: "Participant added and linked to the membership database (label: Women's Club)." });
      await load();
      onChanged();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
    setBusy(false);
  };

  const remove = async (row) => {
    if (!confirm(`Remove ${row.first_name} ${row.last_name} from this session? Her place becomes available again.`)) return;
    try {
      await removeWcParticipant(row.id);
      await load();
      onChanged();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  const download = () => {
    const { date, time } = isoToTbilisi(session.starts_at);
    const blob = new Blob([csv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `womens-club-${date}-${time.replace(":", "")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!rows) return <p className="wcA-muted wcA-pad">Loading participants…</p>;

  return (
    <div className="wcA-participants">
      <div className="wcA-participants-bar">
        <strong>{rows.length} registered</strong>
        <span>
          {rows.length > 0 && <button type="button" className="admin-btn admin-btn-sm" onClick={download}>Export CSV</button>}
          {canEdit && !adding && <button type="button" className="admin-btn admin-btn-sm admin-btn-primary" onClick={() => setAdding(true)}>+ Add participant</button>}
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
        <p className="wcA-muted wcA-pad">Nobody has registered yet.</p>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr><th>#</th><th>Name</th><th>Phone</th><th>Email</th><th>Level</th><th>Member</th><th>Registered</th>{canEdit && <th />}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td><strong>{r.first_name} {r.last_name}</strong>{r.source === "admin" && <span className="wcA-tag">added by admin</span>}</td>
                  <td className="nowrap"><a href={`tel:+${r.phone}`}>{formatPhone(r.phone)}</a></td>
                  <td>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : "—"}</td>
                  <td><span className={`wcA-level lv-${r.level}`}>{LEVEL_LABELS[r.level]}</span></td>
                  <td>{r.member_id ? <Link to={`${clubBase}/members/${r.member_id}`}>{r.member_code || "Profile"}</Link> : "—"}</td>
                  <td className="nowrap">{new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Tbilisi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  {canEdit && <td><button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => remove(r)}>Remove</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── One session ──────────────────────────────────────────────────────
function SessionRow({ session, canEdit, clubBase, onChanged, setNotice }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const local = isoToTbilisi(session.starts_at);
  const [draft, setDraft] = useState({
    date: local.date,
    time: local.time,
    endTime: session.ends_at ? isoToTbilisi(session.ends_at).time : "",
    capacity: session.capacity,
    note: session.note || "",
  });
  const past = new Date(session.starts_at) <= new Date();
  const full = session.taken >= session.capacity;
  const status = past ? "Past" : !session.is_open ? "Closed" : full ? "Full" : "Open";
  const { weekday, day } = sessionParts(session.starts_at, "en");
  const time = timeRange(session.starts_at, session.ends_at);

  const save = async (e) => {
    e.preventDefault();
    try {
      await updateWcSession(session.id, {
        starts_at: tbilisiToIso(draft.date, draft.time),
        ends_at: draft.endTime ? tbilisiToIso(draft.date, draft.endTime) : null,
        capacity: Number(draft.capacity),
        note: draft.note.trim() || null,
      });
      setEditing(false);
      setNotice({ type: "success", text: "Session updated." });
      onChanged();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  const toggleOpen = async () => {
    try {
      await updateWcSession(session.id, { is_open: !session.is_open });
      onChanged();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  const remove = async () => {
    const warn = session.taken ? ` Its ${session.taken} registration${session.taken === 1 ? "" : "s"} will be deleted too (the members stay in the club database).` : "";
    if (!confirm(`Delete ${weekday} ${day}, ${time}?${warn}`)) return;
    try {
      await deleteWcSession(session.id);
      onChanged();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  const pct = Math.min(100, Math.round((session.taken / session.capacity) * 100));

  return (
    <li className={`wcA-session st-${status.toLowerCase()}`}>
      <div className="wcA-session-main">
        <button type="button" className="wcA-session-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="wcA-when">
            <strong>{weekday}, {day}</strong>
            <span className="wcA-time">{time}</span>
          </span>
          <span className="wcA-capacity">
            <span className="wcA-bar"><span style={{ width: `${pct}%` }} /></span>
            <span>{session.taken} / {session.capacity}</span>
          </span>
          <span className={`wcA-status st-${status.toLowerCase()}`}>{status}</span>
          <span className="wcA-chevron" aria-hidden="true">{open ? "▴" : "▾"}</span>
        </button>
        {canEdit && (
          <span className="wcA-actions">
            <button type="button" className="admin-btn admin-btn-sm" onClick={() => setEditing((v) => !v)}>Edit</button>
            {!past && (
              <button type="button" className="admin-btn admin-btn-sm" onClick={toggleOpen} title={session.is_open ? "Stop new registrations from the website" : "Allow registrations again"}>
                {session.is_open ? "Close" : "Reopen"}
              </button>
            )}
            <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={remove}>Delete</button>
          </span>
        )}
      </div>
      {session.note && !editing && <p className="wcA-muted wcA-note">{session.note}</p>}
      {editing && (
        <form className="wcA-edit" onSubmit={save}>
          <label>Date<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required /></label>
          <label>From<input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} required /></label>
          <label>To<input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} /></label>
          <label>Places<input type="number" min={1} max={500} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} required /></label>
          <label className="wide">Note (staff only)<input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="e.g. coach: Nino" /></label>
          {Number(draft.capacity) < session.taken && (
            <p className="wcA-error-text wide">{session.taken} people are already registered; lowering the capacity below that won't remove anyone, it just closes the session.</p>
          )}
          <span className="wcA-add-actions">
            <button type="submit" className="admin-btn admin-btn-sm admin-btn-primary">Save</button>
            <button type="button" className="admin-btn admin-btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </span>
        </form>
      )}
      {open && <Participants session={session} canEdit={canEdit} clubBase={clubBase} onChanged={onChanged} setNotice={setNotice} />}
    </li>
  );
}

// ── Page ─────────────────────────────────────────────────────────────
export default function WomensClubAdminPage({ isSuperadmin, basePath }) {
  const clubBase = `${basePath}/club`;
  const [sessions, setSessions] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const [notice, setNotice] = useState(null);
  const [copied, setCopied] = useState(false);
  const [single, setSingle] = useState(null);

  const load = useCallback(async () => {
    try {
      const from = showPast ? undefined : new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      setSessions(await fetchWcSessions({ from }));
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
      setSessions([]);
    }
  }, [showPast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (notice?.type !== "success") return undefined;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const weeks = useMemo(() => {
    const groups = new Map();
    for (const s of sessions || []) {
      const key = weekKey(s.starts_at);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    return [...groups.entries()];
  }, [sessions]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", SHARE_URL);
    }
  };

  const addSingle = async (e) => {
    e.preventDefault();
    try {
      await createWcSessions([{
        starts_at: tbilisiToIso(single.date, single.time),
        ends_at: single.endTime ? tbilisiToIso(single.date, single.endTime) : null,
        capacity: Number(single.capacity),
      }]);
      setSingle(null);
      setNotice({ type: "success", text: "Session added." });
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  return (
    <div className="admin-page wcA">
      <h2>Women's Club</h2>
      <div className="wcA-card wcA-share">
        <div>
          <h3>Registration link</h3>
          <p className="wcA-muted">Share it in the WhatsApp group. The page is also in the website menu. Registration is free and never touches table bookings.</p>
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

      <TimeSlots canEdit={isSuperadmin} onWeekCreated={load} setNotice={setNotice} />

      <div className="wcA-list-head">
        <h3>Sessions</h3>
        <span>
          <label className="wcA-check">
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Show past sessions
          </label>
          {isSuperadmin && !single && (
            <button type="button" className="admin-btn admin-btn-sm" onClick={() => setSingle({ date: nextMonday(), time: "19:30", endTime: "21:00", capacity: WC_DEFAULT_CAPACITY })}>
              + Single session
            </button>
          )}
        </span>
      </div>

      {single && (
        <form className="wcA-card wcA-edit" onSubmit={addSingle}>
          <label>Date<input type="date" value={single.date} onChange={(e) => setSingle({ ...single, date: e.target.value })} required /></label>
          <label>From<input type="time" value={single.time} onChange={(e) => setSingle({ ...single, time: e.target.value })} required /></label>
          <label>To<input type="time" value={single.endTime} onChange={(e) => setSingle({ ...single, endTime: e.target.value })} /></label>
          <label>Places<input type="number" min={1} max={500} value={single.capacity} onChange={(e) => setSingle({ ...single, capacity: e.target.value })} required /></label>
          <span className="wcA-add-actions">
            <button type="submit" className="admin-btn admin-btn-sm admin-btn-primary">Add session</button>
            <button type="button" className="admin-btn admin-btn-sm" onClick={() => setSingle(null)}>Cancel</button>
          </span>
        </form>
      )}

      {sessions === null ? (
        <p className="wcA-muted">Loading…</p>
      ) : weeks.length === 0 ? (
        <p className="admin-empty">No upcoming sessions. {isSuperadmin ? "Create a week above." : ""}</p>
      ) : (
        weeks.map(([monday, list]) => (
          <section key={monday} className="wcA-week">
            <h4>{formatWeek(monday)}</h4>
            <ul>
              {list.map((s) => (
                <SessionRow key={`${s.id}-${s.starts_at}-${s.capacity}`} session={s} canEdit={isSuperadmin} clubBase={clubBase} onChanged={load} setNotice={setNotice} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
