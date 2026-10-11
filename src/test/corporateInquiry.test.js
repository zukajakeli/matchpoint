import { describe, it, expect } from "vitest";
import {
  validateInquiry,
  buildInquiryEmail,
  MIN_FILL_MS,
} from "../../supabase/functions/_shared/corporateInquiry.ts";

const NOW = 1_800_000_000_000;

const valid = {
  fullName: "  Nino   Beridze ",
  company: "Acme LLC",
  email: "Nino@Example.com ",
  phone: "+995 555 12 34 56",
  eventDate: "2026-12-05",
  participants: "40",
  message: "We'd like a team tournament\r\n\r\n\r\nfor about 40 people.",
  website: "",
  startedAt: NOW - 60_000,
};

describe("validateInquiry", () => {
  it("accepts and normalises a complete form", () => {
    const res = validateInquiry(valid, NOW);
    expect(res.ok).toBe(true);
    expect(res.inquiry).toEqual({
      full_name: "Nino Beridze",
      company: "Acme LLC",
      email: "nino@example.com",
      phone: "+995 555 12 34 56",
      event_date: "2026-12-05",
      participants: 40,
      message: "We'd like a team tournament\n\nfor about 40 people.",
    });
  });

  it("treats optional fields as optional", () => {
    const res = validateInquiry({ ...valid, company: "", eventDate: "", participants: "" }, NOW);
    expect(res.ok).toBe(true);
    expect(res.inquiry.company).toBeNull();
    expect(res.inquiry.event_date).toBeNull();
    expect(res.inquiry.participants).toBeNull();
  });

  it("reports each invalid required field", () => {
    const res = validateInquiry(
      { ...valid, fullName: "", email: "nope", phone: "12", message: "hi", participants: "-3", eventDate: "05/12/2026" },
      NOW
    );
    expect(res.ok).toBe(false);
    expect(res.spam).toBe(false);
    expect(Object.keys(res.errors).sort()).toEqual(
      ["email", "event_date", "full_name", "message", "participants", "phone"].sort()
    );
  });

  it("rejects over-long input", () => {
    const res = validateInquiry({ ...valid, message: "x".repeat(5001) }, NOW);
    expect(res.ok).toBe(false);
    expect(res.errors.message).toBe("too_long");
  });

  it("flags the honeypot and too-fast submissions as spam", () => {
    expect(validateInquiry({ ...valid, website: "http://spam" }, NOW)).toMatchObject({ ok: false, spam: true });
    expect(validateInquiry({ ...valid, startedAt: NOW - MIN_FILL_MS + 1 }, NOW)).toMatchObject({ ok: false, spam: true });
    expect(validateInquiry({ ...valid, startedAt: undefined }, NOW)).toMatchObject({ ok: false, spam: true });
  });
});

describe("buildInquiryEmail", () => {
  it("lists every field and escapes user input", () => {
    const { inquiry } = validateInquiry({ ...valid, fullName: "Nino <script>", message: "Hello <b>team</b>, 40 people" }, NOW);
    const { subject, html, text } = buildInquiryEmail(inquiry, new Date("2026-10-11T10:00:00Z"));
    expect(subject).toBe("Corporate inquiry: Nino <script> (Acme LLC)");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Nino &lt;script&gt;");
    expect(html).toContain("Hello &lt;b&gt;team&lt;/b&gt;");
    for (const label of ["Full name", "Company", "Email", "Phone", "Preferred date", "Participants", "Message"]) {
      expect(text).toContain(label);
    }
    expect(text).toContain("Participants: 40");
    expect(text).toContain("Preferred date: 2026-12-05");
    expect(html).toContain('href="tel:+995555123456"');
  });

  it("shows a dash for empty optional fields", () => {
    const { inquiry } = validateInquiry({ ...valid, company: "", eventDate: "", participants: "" }, NOW);
    const { subject, text } = buildInquiryEmail(inquiry);
    expect(subject).toBe("Corporate inquiry: Nino Beridze");
    expect(text).toContain("Company: —");
    expect(text).toContain("Participants: —");
  });
});
