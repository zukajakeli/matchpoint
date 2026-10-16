import React from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import MembersDirectory from "./MembersDirectory";
import MemberProfile from "./MemberProfile";
import ClubAnalytics from "./ClubAnalytics";
import LoyaltySettings from "./LoyaltySettings";
import AuditLog from "./AuditLog";
import "./ClubPage.css";

// Club membership: member database for staff; analytics, loyalty rules,
// rewards and the audit log for the superadmin.
export default function ClubPage({ basePath, isSuperadmin }) {
  // Absolute links: relative "." inside a club/* splat route resolves to
  // the current URL, which would keep "Members" highlighted everywhere.
  const clubBase = `${basePath}/club`;
  const { pathname } = useLocation();
  const onMembers = pathname === clubBase || pathname.startsWith(`${clubBase}/members`);
  const tabs = [
    { to: clubBase, label: "Members", end: true },
    ...(isSuperadmin
      ? [
          { to: `${clubBase}/analytics`, label: "Analytics" },
          { to: `${clubBase}/loyalty`, label: "Loyalty & Rewards" },
          { to: `${clubBase}/audit`, label: "Audit log" },
        ]
      : []),
  ];

  return (
    <div className="club-page">
      <div className="club-header">
        <h1>Club</h1>
        <nav className="club-tabs">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `club-tab ${(tab.to === clubBase ? onMembers : isActive) ? "active" : ""}`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Routes>
        <Route index element={<MembersDirectory clubBase={clubBase} />} />
        <Route path="members/:memberId" element={<MemberProfile clubBase={clubBase} isSuperadmin={isSuperadmin} />} />
        {isSuperadmin && <Route path="analytics" element={<ClubAnalytics />} />}
        {isSuperadmin && <Route path="loyalty" element={<LoyaltySettings />} />}
        {isSuperadmin && <Route path="audit" element={<AuditLog />} />}
      </Routes>
    </div>
  );
}
