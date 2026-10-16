import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchWcSessions,
  createWcSessions,
  updateWcSession,
  deleteWcSession,
  fetchWcRegistrations,
  adminAddWcParticipant,
  removeWcParticipant,
  wcErrorCode,
  WC_DEFAULT_CAPACITY,
  WC_LEVELS,
} from "../../services/supabase/womensClubApi";
import { buildWeek, isoToTbilisi, nextMonday, sessionParts, tbilisiToIso, validateWcForm } from "../../utils/womensClub";
import { formatPhone } from "../../utils/memberAnalytics";
import { SITE } from "../../seo/seo";
import "./WomensClubAdmin.css";

// Club → Women's Club. Staff can see the schedule and lists; only the
// superadmin can change them (enforced by RLS and the wc_* functions).

const SHARE_URL = `${SITE.url}/womens-club`;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
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
  if (/wc_sessions|wc_registrations|wc_admin_add/.test(msg) && /does not exist|schema cache|Could not find/i.test(msg)) {
    return "The women's club tables are missing. Run supabase/migrations/2026-10-16_womens_club.sql in the Supabase SQL editor.";
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
    [i + 1, r.first_name, r.last_name, formatPhone(r.phone), r.email, LEVEL_LABELS[r.level], r.members?.member_code, r.source, r.created_at?.slice(0, 16).replace("T", " ")]
      .map(esc)
      .join(",")
  );
  return "﻿" + ["#,First name,Last name,Phone,Email,Level,Member ID,Source,Registered (UTC)", ...lines].join("\r\n");
}

// ── Week builder ─────────────────────────────────────────────────────
function WeekBuilder({ existing, onCreated, setNotice }) {
  const [weekStart, setWeekStart] = useState(nextMonday());
  const [days, setDays] = useState([0, 1, 2, 3, 4]);
  const [time, setTime] = useState("19:30");
  const [capacity, setCapacity] = useState(WC_DEFAULT_CAPACITY);
  const [busy, setBusy] = useState(false);

  const toggleDay = (d) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const create = async (e) => {
    e.preventDefault();
    if (!days.length) return setNotice({ type: "error", text: "Pick at least one day." });
    const taken = new Set(existing.map((s) => new Date(s.starts_at).getTime()));
    const rows = buildWeek(weekStart, days, time, Number(capacity)).filter((r) => !taken.has(new Date(r.starts_at).getTime()));
    if (!rows.length) return setNotice({ type: "error", text: "Those sessions already exist." });
    setBusy(true);
    try {
      await createWcSessions(rows);
      setNotice({ type: "success", text: `${rows.length} session${rows.length === 1 ? "" : "s"} created.` });
      onCreated();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
    setBusy(false);
  };

  return (
    <form className="club-card wcA-builder" onSubmit={create}>
      <h3>Create a week</h3>
      <div className="wcA-builder-row">
        <label>
          Week starting (Monday)
          <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} required />
        </label>
        <label>
          Time
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
        <label>
          Places per session
          <input type="number" min={1} max={500} value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
        </label>
      </div>
      <div className="wcA-days" role="group" aria-label="Days">
        {WEEKDAYS.map((name, i) => (
          <label key={name} className={`wcA-day ${days.includes(i) ? "on" : ""}`}>
            <input type="checkbox" checked={days.includes(i)} onChange={() => toggleDay(i)} />
            {name}
          </label>
        ))}
      </div>
      <p className="club-muted">Times are Tbilisi time. Days that already have a session at this time are skipped. Each session can be edited afterwards.</p>
      <button type="submit" className="club-btn club-btn-primary" disabled={busy}>{busy ? "Creating…" : "Create sessions"}</button>
    </form>
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
      setNotice({ type: "success", text: "Participant added and linked to the member database." });
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

  if (!rows) return <p className="club-muted wcA-pad">Loading participants…</p>;

  return (
    <div className="wcA-participants">
      <div className="wcA-participants-bar">
        <strong>{rows.length} registered</strong>
        <span>
          {rows.length > 0 && <button type="button" className="club-btn" onClick={download}>Export CSV</button>}
          {canEdit && !adding && <button type="button" className="club-btn club-btn-primary" onClick={() => setAdding(true)}>+ Add participant</button>}
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
            <button type="submit" className="club-btn club-btn-primary" disabled={busy}>{busy ? "Adding…" : "Add"}</button>
            <button type="button" className="club-btn" onClick={() => setAdding(false)}>Cancel</button>
          </span>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="club-muted wcA-pad">Nobody has registered yet.</p>
      ) : (
        <div className="club-table-wrap">
          <table className="club-table">
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
                  <td>{r.member_id ? <Link to={`${clubBase}/members/${r.member_id}`}>{r.members?.member_code || "Profile"}</Link> : "—"}</td>
                  <td className="nowrap">{new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Tbilisi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  {canEdit && <td><button type="button" className="club-btn wcA-danger" onClick={() => remove(r)}>Remove</button></td>}
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
  const [draft, setDraft] = useState({ date: local.date, time: local.time, capacity: session.capacity, note: session.note || "" });
  const past = new Date(session.starts_at) <= new Date();
  const full = session.taken >= session.capacity;
  const status = past ? "Past" : !session.is_open ? "Closed" : full ? "Full" : "Open";
  const { weekday, day, time } = sessionParts(session.starts_at, "en");

  const save = async (e) => {
    e.preventDefault();
    try {
      await updateWcSession(session.id, {
        starts_at: tbilisiToIso(draft.date, draft.time),
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
            <button type="button" className="club-btn" onClick={() => setEditing((v) => !v)}>Edit</button>
            {!past && (
              <button type="button" className="club-btn" onClick={toggleOpen} title={session.is_open ? "Stop new registrations from the website" : "Allow registrations again"}>
                {session.is_open ? "Close" : "Reopen"}
              </button>
            )}
            <button type="button" className="club-btn wcA-danger" onClick={remove}>Delete</button>
          </span>
        )}
      </div>
      {session.note && !editing && <p className="club-muted wcA-note">{session.note}</p>}
      {editing && (
        <form className="wcA-edit" onSubmit={save}>
          <label>Date<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required /></label>
          <label>Time<input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} required /></label>
          <label>Places<input type="number" min={1} max={500} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} required /></label>
          <label className="wide">Note (staff only)<input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="e.g. coach: Nino" /></label>
          {Number(draft.capacity) < session.taken && (
            <p className="club-error wide">{session.taken} people are already registered; lowering the capacity below that won't remove anyone, it just closes the session.</p>
          )}
          <span className="wcA-add-actions">
            <button type="submit" className="club-btn club-btn-primary">Save</button>
            <button type="button" className="club-btn" onClick={() => setEditing(false)}>Cancel</button>
          </span>
        </form>
      )}
      {open && <Participants session={session} canEdit={canEdit} clubBase={clubBase} onChanged={onChanged} setNotice={setNotice} />}
    </li>
  );
}

// ── Page ─────────────────────────────────────────────────────────────
export default function WomensClubAdmin({ isSuperadmin, clubBase }) {
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
      await createWcSessions([{ starts_at: tbilisiToIso(single.date, single.time), capacity: Number(single.capacity) }]);
      setSingle(null);
      setNotice({ type: "success", text: "Session added." });
      load();
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    }
  };

  return (
    <div className="wcA">
      <div className="club-card wcA-share">
        <div>
          <h3>Registration link</h3>
          <p className="club-muted">Share it in the WhatsApp group. The page isn't in the menus, the sitemap or search engines.</p>
        </div>
        <div className="wcA-link">
          <code>{SHARE_URL}</code>
          <button type="button" className="club-btn club-btn-primary" onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</button>
          <a className="club-btn" href="/womens-club" target="_blank" rel="noopener noreferrer">Open</a>
        </div>
      </div>

      {notice && (
        <div className={`wcA-notice ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {isSuperadmin && <WeekBuilder existing={sessions || []} onCreated={load} setNotice={setNotice} />}

      <div className="wcA-list-head">
        <h3>Sessions</h3>
        <span>
          <label className="wcA-check">
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Show past sessions
          </label>
          {isSuperadmin && !single && (
            <button type="button" className="club-btn" onClick={() => setSingle({ date: nextMonday(), time: "19:30", capacity: WC_DEFAULT_CAPACITY })}>
              + Single session
            </button>
          )}
        </span>
      </div>

      {single && (
        <form className="club-card wcA-edit" onSubmit={addSingle}>
          <label>Date<input type="date" value={single.date} onChange={(e) => setSingle({ ...single, date: e.target.value })} required /></label>
          <label>Time<input type="time" value={single.time} onChange={(e) => setSingle({ ...single, time: e.target.value })} required /></label>
          <label>Places<input type="number" min={1} max={500} value={single.capacity} onChange={(e) => setSingle({ ...single, capacity: e.target.value })} required /></label>
          <span className="wcA-add-actions">
            <button type="submit" className="club-btn club-btn-primary">Add session</button>
            <button type="button" className="club-btn" onClick={() => setSingle(null)}>Cancel</button>
          </span>
        </form>
      )}

      {sessions === null ? (
        <p className="club-muted">Loading…</p>
      ) : weeks.length === 0 ? (
        <p className="club-empty">No upcoming sessions. {isSuperadmin ? "Create a week above." : ""}</p>
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
