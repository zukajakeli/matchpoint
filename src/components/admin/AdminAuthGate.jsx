import React, { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "../../services/supabaseClient";
import "./AdminAuthGate.css";

/**
 * AdminAuthGate — Supabase Auth login + role check.
 *
 * Props:
 *   role: "superadmin" | "staff" — the portal being opened
 *   children: React node
 *
 * The user signs in with email + password (Supabase Auth). Their role
 * comes from the staff_members table via the current_staff_role() RPC:
 *   /superadmin needs role "superadmin"
 *   /staff      accepts "staff" or "superadmin"
 * Database access is enforced by RLS, so this gate is only the UI side.
 */

function roleAllows(portalRole, userRole) {
  if (portalRole === "superadmin") return userRole === "superadmin";
  return userRole === "staff" || userRole === "superadmin";
}

async function fetchStaffRole() {
  const { data, error } = await supabase.rpc("current_staff_role");
  if (error) throw error;
  return data || null;
}

export default function AdminAuthGate({ role = "superadmin", children }) {
  // "checking" | "signed-out" | "no-access" | "authed"
  const [status, setStatus] = useState("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shake, setShake] = useState(false);

  const resolveSession = useCallback(
    async (session) => {
      if (!session) {
        setStatus("signed-out");
        return;
      }
      try {
        const userRole = await fetchStaffRole();
        setStatus(roleAllows(role, userRole) ? "authed" : "no-access");
      } catch (err) {
        console.error("Failed to load staff role:", err);
        setStatus("no-access");
      }
    },
    [role]
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setStatus("signed-out");
      return undefined;
    }
    supabase.auth.getSession().then(({ data }) => resolveSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // Token refreshes don't change who is signed in; skip the extra round trip.
      if (event === "TOKEN_REFRESHED") return;
      // Defer: calling supabase inside this callback can deadlock the auth lock.
      setTimeout(() => resolveSession(session), 0);
    });
    return () => listener.subscription.unsubscribe();
  }, [resolveSession]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (isSubmitting || !supabase) return;
      setIsSubmitting(true);
      setError("");
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setIsSubmitting(false);
      if (signInError) {
        setError("Incorrect email or password.");
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setPassword("");
      }
    },
    [email, password, isSubmitting]
  );

  if (status === "authed") return children;

  const title = role === "superadmin" ? "Superadmin Access" : "Staff Access";

  return (
    <div className="admin-gate-overlay mp-dots-white mp-grain-strong">
      <div className={`admin-gate-card${shake ? " admin-gate-shake" : ""}`}>
        <div className="admin-gate-logo">
          <img src="/matchpoint-logo.png" alt="MatchPoint" />
        </div>
        <h2>{title}</h2>

        {status === "checking" && <p>Checking your session…</p>}

        {status === "no-access" && (
          <>
            <p>This account doesn't have access to the {role} portal.</p>
            <button
              type="button"
              className="admin-gate-btn"
              onClick={() => supabase.auth.signOut()}
            >
              Sign in with another account
            </button>
          </>
        )}

        {status === "signed-out" && (
          <>
            <p>Sign in with your staff account to continue.</p>
            {!isSupabaseConfigured && (
              <p className="admin-gate-error">Supabase is not configured.</p>
            )}
            <form onSubmit={handleSubmit} className="admin-gate-form">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                placeholder="Email"
                autoComplete="username"
                autoFocus
                required
                className={error ? "admin-gate-input error" : "admin-gate-input"}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                placeholder="Password"
                autoComplete="current-password"
                required
                className={error ? "admin-gate-input error" : "admin-gate-input"}
              />
              {error && <p className="admin-gate-error">{error}</p>}
              <button type="submit" className="admin-gate-btn" disabled={isSubmitting}>
                {isSubmitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export function AdminLogoutButton() {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleLogout = async () => {
    await supabase?.auth.signOut();
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
