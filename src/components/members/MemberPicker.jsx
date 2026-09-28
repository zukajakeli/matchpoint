import React, { useEffect, useRef, useState } from "react";
import {
  findMembers,
  registerMember,
  memberErrorMessage,
  fetchRewards,
  fetchRedemptionCounts,
} from "../../services/supabaseData";
import { eligibleRewards, formatPhone, normalizePhone } from "../../utils/memberAnalytics";
import "./MemberPicker.css";

function memberSince(iso) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Tbilisi",
  });
}

// Loud on purpose: reception should tell the member on the spot.
function RewardsBanner({ rewards }) {
  if (!rewards?.length) return null;
  return (
    <div className="member-rewards-banner" role="status">
      <div className="member-rewards-title">
        <span aria-hidden="true">🎁</span> Reward available — tell the member!
      </div>
      <ul className="member-rewards-list">
        {rewards.map((r) => (
          <li key={r.id}>
            <strong>{r.name}</strong> · {r.points_required} pts
          </li>
        ))}
      </ul>
      <div className="member-rewards-hint">Redeem it from their profile in Club.</div>
    </div>
  );
}

export function MemberCard({ member, onClear, clearLabel = "Change", rewards = [] }) {
  return (
    <div className="member-card-wrap">
      <div
        className={`member-card ${member.status !== "active" ? "inactive" : ""} ${
          rewards.length ? "has-rewards" : ""
        }`}
      >
        <div className="member-card-main">
          <div className="member-card-name">
            {member.first_name} {member.last_name}
            <span className="member-card-code">{member.member_code}</span>
          </div>
          {member.registered_at && (
            <div className="member-card-meta">
              Member since {memberSince(member.registered_at)} · {formatPhone(member.phone)}
            </div>
          )}
          {member.status !== "active" && (
            <div className="member-card-warning">Membership {member.status}</div>
          )}
        </div>
        {member.points_balance !== undefined && (
          <div className="member-card-points">
            <strong>{member.points_balance}</strong>
            <span>points</span>
          </div>
        )}
        {onClear && (
          <button type="button" className="member-card-clear" onClick={onClear}>
            {clearLabel}
          </button>
        )}
      </div>
      <RewardsBanner rewards={rewards} />
    </div>
  );
}

/**
 * Reception lookup: phone (or name) → member. Registers new members inline.
 * Props:
 *   selected   — member row or null
 *   onSelect   — (member | null) => void
 */
export default function MemberPicker({ selected, onSelect, autoFocus = false }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [rewards, setRewards] = useState([]);
  const [redemptionCounts, setRedemptionCounts] = useState({});
  const inputRef = useRef(null);

  // Active rewards once; per-member redemption counts for whoever is shown,
  // so "reward available" respects per-member limits.
  useEffect(() => {
    fetchRewards()
      .then(setRewards)
      .catch((error) => console.error("Failed to load rewards:", error));
  }, []);

  const shownIds = [...results.map((m) => m.id), selected?.id].filter(Boolean).sort().join(",");
  useEffect(() => {
    if (!shownIds || rewards.length === 0) return undefined;
    let cancelled = false;
    fetchRedemptionCounts(shownIds.split(","))
      .then((counts) => !cancelled && setRedemptionCounts(counts))
      .catch((error) => console.error("Failed to load redemptions:", error));
    return () => {
      cancelled = true;
    };
  }, [shownIds, rewards.length]);

  const rewardsFor = (member) => eligibleRewards(member, rewards, redemptionCounts[member.id]);

  useEffect(() => {
    if (autoFocus && !selected) inputRef.current?.focus();
  }, [autoFocus, selected]);

  useEffect(() => {
    const trimmed = query.trim();
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length < 3 && trimmed.length < 2) {
      setResults([]);
      setSearchError("");
      return undefined;
    }
    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await findMembers(trimmed);
        if (!cancelled) {
          setResults(rows || []);
          setSearchError("");
        }
      } catch (error) {
        if (!cancelled) setSearchError(memberErrorMessage(error));
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  if (selected) {
    return <MemberCard member={selected} onClear={() => onSelect(null)} rewards={rewardsFor(selected)} />;
  }

  if (isRegistering) {
    return (
      <RegisterMemberForm
        initialPhone={/^[\d\s+()-]+$/.test(query) ? query : ""}
        onCancel={() => setIsRegistering(false)}
        onRegistered={(member) => {
          setIsRegistering(false);
          setQuery("");
          onSelect({ ...member, points_balance: 0 });
        }}
      />
    );
  }

  const exact = results.find((m) => m.phone === normalizePhone(query));
  const digitCount = query.replace(/\D/g, "").length;

  return (
    <div className="member-picker">
      <input
        ref={inputRef}
        className="member-picker-input"
        type="search"
        inputMode="tel"
        placeholder="Member phone (or name)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const pick = exact || (results.length === 1 ? results[0] : null);
            if (pick && pick.status === "active") onSelect(pick);
          }
        }}
      />
      {searchError && <div className="member-picker-error">{searchError}</div>}
      {results.length > 0 && (
        <ul className="member-picker-results">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="member-picker-result"
                disabled={m.status !== "active"}
                onClick={() => onSelect(m)}
              >
                <span className="member-picker-result-name">
                  {m.first_name} {m.last_name}
                  {m.status !== "active" && <em> · {m.status}</em>}
                </span>
                <span className="member-picker-result-meta">
                  {rewardsFor(m).length > 0 && <span className="member-picker-gift">🎁 Reward</span>}
                  {formatPhone(m.phone)} · {m.points_balance} pts
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!isSearching && results.length === 0 && digitCount >= 6 && (
        <div className="member-picker-empty">No member with this number.</div>
      )}
      <button type="button" className="member-picker-register" onClick={() => setIsRegistering(true)}>
        + Register new member
      </button>
    </div>
  );
}

export function RegisterMemberForm({ initialPhone = "", onCancel, onRegistered }) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: initialPhone,
    email: "",
    personalId: "",
  });
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      const member = await registerMember(form);
      onRegistered(member);
    } catch (err) {
      setError(memberErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  // Rendered inside other forms (Start modal), so this is a div, not a form.
  return (
    <div
      className="member-register"
      onKeyDown={(e) => {
        if (e.key === "Enter") handleSubmit(e);
      }}
    >
      <div className="member-register-title">New Club Member</div>
      <div className="member-register-grid">
        <input placeholder="First name" value={form.firstName} onChange={set("firstName")} autoFocus required />
        <input placeholder="Last name" value={form.lastName} onChange={set("lastName")} required />
        <input placeholder="Phone" inputMode="tel" value={form.phone} onChange={set("phone")} required />
        <input placeholder="Email" type="email" value={form.email} onChange={set("email")} />
        <input placeholder="Personal ID (if required)" value={form.personalId} onChange={set("personalId")} />
      </div>
      {error && <div className="member-picker-error">{error}</div>}
      <div className="member-register-actions">
        <button type="button" className="member-register-cancel" onClick={onCancel} disabled={isSaving}>
          Cancel
        </button>
        <button type="button" className="member-register-save" onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? "Registering…" : "Register member"}
        </button>
      </div>
    </div>
  );
}
