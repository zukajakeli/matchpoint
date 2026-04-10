import React, { useState, useEffect, useCallback } from "react";
import { fetchEvents, createEvent, updateEvent, deleteEvent, fetchEventRegistrations, markRegistrationPaid, deleteRegistration } from "../services/supabase/eventsApi";
import "./AdminPages.css";

export default function EventsAdminPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  // Form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [regDeadline, setRegDeadline] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [entryFee, setEntryFee] = useState("0");
  const [allowOffline, setAllowOffline] = useState(true);

  // Registrations view
  const [viewRegsForEvent, setViewRegsForEvent] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [regsLoading, setRegsLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchEvents(false);
      setEvents(data);
    } catch (e) {
      console.error("Failed to load events:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setShowForm(false);
    setTitle("");
    setDescription("");
    setImage("");
    setEventDate("");
    setRegDeadline("");
    setMaxParticipants("");
    setEntryFee("0");
    setAllowOffline(true);
  };

  const handleEdit = (ev) => {
    setEditingId(ev.id);
    setShowForm(true);
    setTitle(ev.title);
    setDescription(ev.description || "");
    setImage(ev.image || "");
    setEventDate(ev.event_date ? ev.event_date.slice(0, 16) : "");
    setRegDeadline(ev.registration_deadline ? ev.registration_deadline.slice(0, 16) : "");
    setMaxParticipants(ev.max_participants || "");
    setEntryFee(ev.entry_fee || "0");
    setAllowOffline(ev.allow_offline_payment !== false);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      title,
      description,
      image,
      event_date: new Date(eventDate).toISOString(),
      registration_deadline: regDeadline ? new Date(regDeadline).toISOString() : null,
      max_participants: maxParticipants ? Number(maxParticipants) : null,
      entry_fee: Number(entryFee) || 0,
      allow_offline_payment: allowOffline,
    };
    try {
      if (editingId) {
        await updateEvent(editingId, payload);
      } else {
        await createEvent(payload);
      }
      resetForm();
      load();
    } catch (err) {
      console.error("Save failed:", err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this event and all registrations?")) return;
    try {
      await deleteEvent(id);
      load();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleToggleActive = async (ev) => {
    try {
      await updateEvent(ev.id, { is_active: !ev.is_active });
      load();
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  };

  const handleViewRegs = async (ev) => {
    setViewRegsForEvent(ev);
    setRegsLoading(true);
    try {
      const data = await fetchEventRegistrations(ev.id);
      setRegistrations(data);
    } catch (e) {
      console.error("Failed to load registrations:", e);
    }
    setRegsLoading(false);
  };

  const handleMarkPaid = async (regId) => {
    try {
      await markRegistrationPaid(regId);
      if (viewRegsForEvent) handleViewRegs(viewRegsForEvent);
    } catch (e) {
      console.error("Mark paid failed:", e);
    }
  };

  const handleDeleteReg = async (regId) => {
    if (!confirm("Remove this registration?")) return;
    try {
      await deleteRegistration(regId);
      if (viewRegsForEvent) handleViewRegs(viewRegsForEvent);
    } catch (e) {
      console.error("Delete reg failed:", e);
    }
  };

  return (
    <div className="admin-page">
      <h2>Events & Tournaments</h2>

      {!showForm && !viewRegsForEvent && (
        <button onClick={() => setShowForm(true)} className="admin-btn admin-btn-primary" style={{ marginBottom: 24 }}>
          + Create Event
        </button>
      )}

      {/* Registration viewer */}
      {viewRegsForEvent && (
        <div className="admin-form">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Registrations: {viewRegsForEvent.title}</h3>
            <button onClick={() => setViewRegsForEvent(null)} className="admin-btn admin-btn-secondary">Close</button>
          </div>

          {regsLoading ? (
            <p>Loading...</p>
          ) : registrations.length === 0 ? (
            <p className="admin-empty">No registrations yet.</p>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th>Registered</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.participant_name}</strong></td>
                      <td>{r.participant_email}</td>
                      <td>{r.participant_phone}</td>
                      <td>{r.payment_method}</td>
                      <td>
                        <span className={`admin-status-badge ${r.payment_status === "paid" ? "active" : r.payment_status === "pending" ? "warning" : "inactive"}`}>
                          {r.payment_status}
                        </span>
                      </td>
                      <td>{new Date(r.created_at).toLocaleDateString()}</td>
                      <td>
                        {r.payment_status !== "paid" && (
                          <button onClick={() => handleMarkPaid(r.id)} className="admin-btn admin-btn-sm">Mark Paid</button>
                        )}
                        <button onClick={() => handleDeleteReg(r.id)} className="admin-btn admin-btn-sm admin-btn-danger">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ marginTop: 12, fontSize: "0.85rem", color: "#6b7280" }}>
            Total: {registrations.length} registered · {registrations.filter((r) => r.payment_status === "paid").length} paid
          </p>
        </div>
      )}

      {/* Event form */}
      {showForm && !viewRegsForEvent && (
        <form onSubmit={handleSubmit} className="admin-form">
          <h3>{editingId ? "Edit Event" : "Create Event"}</h3>
          <div className="admin-field">
            <label>Event Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Spring Ping Pong Tournament" />
          </div>
          <div className="admin-field">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Event details..." />
          </div>
          <div className="admin-field">
            <label>Event Image</label>
            <input type="file" accept="image/*" onChange={handleImageUpload} />
            {image && <img src={image} alt="Preview" className="admin-image-preview" />}
          </div>
          <div className="admin-field-row-2">
            <div className="admin-field">
              <label>Event Date & Time</label>
              <input type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
            </div>
            <div className="admin-field">
              <label>Registration Deadline (optional)</label>
              <input type="datetime-local" value={regDeadline} onChange={(e) => setRegDeadline(e.target.value)} />
            </div>
          </div>
          <div className="admin-field-row-2">
            <div className="admin-field">
              <label>Max Participants (leave empty for unlimited)</label>
              <input type="number" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} min={1} placeholder="Unlimited" />
            </div>
            <div className="admin-field">
              <label>Entry Fee (₾, 0 = free)</label>
              <input type="number" value={entryFee} onChange={(e) => setEntryFee(e.target.value)} min={0} step="0.01" />
            </div>
          </div>
          <div className="admin-field admin-field-row">
            <label>
              <input type="checkbox" checked={allowOffline} onChange={(e) => setAllowOffline(e.target.checked)} />
              {" "}Allow "Pay at Venue" option
            </label>
          </div>
          <div className="admin-actions">
            <button type="submit" className="admin-btn admin-btn-primary">
              {editingId ? "Save Changes" : "Create Event"}
            </button>
            <button type="button" onClick={resetForm} className="admin-btn admin-btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Events list */}
      {!showForm && !viewRegsForEvent && (
        <div className="admin-list">
          <h3>All Events ({events.length})</h3>
          {loading ? (
            <p>Loading...</p>
          ) : events.length === 0 ? (
            <p className="admin-empty">No events yet.</p>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>Title</th>
                    <th>Date</th>
                    <th>Fee</th>
                    <th>Spots</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id}>
                      <td>{ev.image && <img src={ev.image} alt="" className="admin-thumb" />}</td>
                      <td><strong>{ev.title}</strong></td>
                      <td>{new Date(ev.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td>{ev.entry_fee > 0 ? `${ev.entry_fee} ₾` : "Free"}</td>
                      <td>{ev.max_participants || "∞"}</td>
                      <td>
                        <button
                          onClick={() => handleToggleActive(ev)}
                          className={`admin-status-badge ${ev.is_active ? "active" : "inactive"}`}
                        >
                          {ev.is_active ? "Active" : "Hidden"}
                        </button>
                      </td>
                      <td>
                        <button onClick={() => handleViewRegs(ev)} className="admin-btn admin-btn-sm">Registrations</button>
                        <button onClick={() => handleEdit(ev)} className="admin-btn admin-btn-sm">Edit</button>
                        <button onClick={() => handleDelete(ev.id)} className="admin-btn admin-btn-sm admin-btn-danger">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
