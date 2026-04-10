import React, { useState, useCallback } from "react";
import "./AdminAuthGate.css";

const SUPERADMIN_PASSWORD = import.meta.env.VITE_SUPERADMIN_PASSWORD || import.meta.env.VITE_ADMIN_PASSWORD || "";
const STAFF_PASSWORD = import.meta.env.VITE_STAFF_PASSWORD || "";

/**
 * AdminAuthGate — role-aware password gate.
 *
 * Props:
 *   role: "superadmin" | "staff"
 *   children: React node
 *
 * /superadmin uses VITE_SUPERADMIN_PASSWORD (falls back to VITE_ADMIN_PASSWORD)
 * /staff     uses VITE_STAFF_PASSWORD
 */

function storageKey(role) {
  return `matchpoint_auth_${role}`;
}

function correctPassword(role) {
  return role === "superadmin" ? SUPERADMIN_PASSWORD : STAFF_PASSWORD;
}

function isAuthenticated(role) {
  try {
    const pwd = correctPassword(role);
    return sessionStorage.getItem(storageKey(role)) === pwd && pwd !== "";
  } catch {
    return false;
  }
}

export default function AdminAuthGate({ role = "superadmin", children }) {
  const [authed, setAuthed] = useState(() => isAuthenticated(role));
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const pwd = correctPassword(role);
      if (input === pwd && pwd !== "") {
        sessionStorage.setItem(storageKey(role), input);
        setAuthed(true);
        setError(false);
      } else {
        setError(true);
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setInput("");
      }
    },
    [input, role]
  );

  if (authed) return children;

  const title = role === "superadmin" ? "Superadmin Access" : "Staff Access";
  const subtitle = role === "superadmin"
    ? "Enter the superadmin password to continue."
    : "Enter the staff password to continue.";

  return (
    <div className="admin-gate-overlay">
      <div className={`admin-gate-card${shake ? " admin-gate-shake" : ""}`}>
        <div className="admin-gate-logo">
          <img src="/matchpoint-logo.png" alt="MatchPoint" />
        </div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
        <form onSubmit={handleSubmit} className="admin-gate-form">
          <input
            type="password"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(false);
            }}
            placeholder="Password"
            autoFocus
            className={error ? "admin-gate-input error" : "admin-gate-input"}
          />
          {error && <p className="admin-gate-error">Incorrect password. Try again.</p>}
          <button type="submit" className="admin-gate-btn">
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}

export function AdminLogoutButton({ role = "superadmin" }) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleLogout = () => {
    try {
      sessionStorage.removeItem(storageKey(role));
    } catch {
      // ignore
    }
    window.location.reload();
  };

  // Close popover on outside click
  React.useEffect(() => {
    if (!showConfirm) return;
    const handler = (e) => {
      if (!e.target.closest(".logout-popover-wrapper")) {
        setShowConfirm(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showConfirm]);

  return (
    <div className="logout-popover-wrapper">
      <button
        onClick={() => setShowConfirm((v) => !v)}
        className="admin-logout-btn"
        title="Log out"
      >
        Log out
      </button>
      {showConfirm && (
        <div className="logout-popover">
          <p>Sure you want to log out?</p>
          <div className="logout-popover-actions">
            <button className="logout-confirm-btn" onClick={handleLogout}>
              Yes, log out
            </button>
            <button className="logout-cancel-btn" onClick={() => setShowConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
