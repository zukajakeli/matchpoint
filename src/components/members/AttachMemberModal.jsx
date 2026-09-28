import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import MemberPicker, { MemberCard } from "./MemberPicker";

// "Attach Member" on a table whose timer is already running (member
// forgot to say, joined mid-session, or the wrong member was picked).
// The whole session — from its original start — goes to the member.
// Portalled to <body>: table cards are transformed, which would trap a
// position: fixed overlay inside the card.
export default function AttachMemberModal({ table, onAttach, onClose }) {
  const [member, setMember] = useState(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const current = table.memberId
    ? { id: table.memberId, first_name: table.memberName || "Member", last_name: "", status: "active" }
    : null;

  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content attach-member-modal">
        <h4>{current ? "Change member" : "Attach member"} · {table.name}</h4>
        {current && (
          <div className="attach-member-current">
            <span className="booking-link-label">Currently playing</span>
            <MemberCard
              member={current}
              clearLabel="Remove"
              onClear={() => {
                onAttach(null);
                onClose();
              }}
            />
          </div>
        )}
        <span className="booking-link-label">{current ? "Replace with" : "Find member"}</span>
        <MemberPicker selected={member} onSelect={setMember} autoFocus />
        <div className="modal-actions">
          <button
            type="button"
            className="confirm-start-btn"
            disabled={!member || member.id === table.memberId}
            onClick={() => {
              onAttach(member);
              onClose();
            }}
          >
            {current ? "Change member" : "Attach to this session"}
          </button>
          <button type="button" className="cancel-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
