// Corporate inquiry form (/corporate-events): validation, spam checks and
// the notification email. Pure functions so they can be unit-tested; the
// corporate-inquiry edge function does the I/O.

export interface CorporateInquiry {
  full_name: string;
  company: string | null;
  email: string;
  phone: string;
  event_date: string | null; // YYYY-MM-DD
  participants: number | null;
  message: string;
}

export type InquiryField = keyof CorporateInquiry;

// A form filled in faster than this is treated as a bot.
export const MIN_FILL_MS = 3000;

const LIMITS: Record<string, number> = {
  full_name: 120,
  company: 160,
  email: 200,
  phone: 40,
  message: 5000,
};

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function cleanMultiline(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : "";
}

export function validateInquiry(
  body: Record<string, unknown>,
  now: number = Date.now()
): { ok: true; inquiry: CorporateInquiry } | { ok: false; spam: boolean; errors: Partial<Record<InquiryField, string>> } {
  // Honeypot: a field real visitors never see. startedAt: when the form rendered.
  if (clean(body.website) !== "") return { ok: false, spam: true, errors: {} };
  const startedAt = Number(body.startedAt);
  if (!Number.isFinite(startedAt) || now - startedAt < MIN_FILL_MS) {
    return { ok: false, spam: true, errors: {} };
  }

  const errors: Partial<Record<InquiryField, string>> = {};
  const full_name = clean(body.fullName);
  const company = clean(body.company);
  const email = clean(body.email).toLowerCase();
  const phone = clean(body.phone);
  const message = cleanMultiline(body.message);
  const eventDateRaw = clean(body.eventDate);
  const participantsRaw = clean(String(body.participants ?? ""));

  if (full_name.length < 2) errors.full_name = "required";
  if (!EMAIL_RE.test(email)) errors.email = "invalid";
  const digits = phone.replace(/\D/g, "");
  if (!/^[+\d\s()-]+$/.test(phone) || digits.length < 6 || digits.length > 15) errors.phone = "invalid";
  if (message.length < 10) errors.message = "required";

  for (const [key, value] of Object.entries({ full_name, company, email, phone, message })) {
    if (value.length > LIMITS[key]) errors[key as InquiryField] = "too_long";
  }

  let event_date: string | null = null;
  if (eventDateRaw) {
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(eventDateRaw) && !Number.isNaN(Date.parse(`${eventDateRaw}T00:00:00Z`));
    if (valid) event_date = eventDateRaw;
    else errors.event_date = "invalid";
  }

  let participants: number | null = null;
  if (participantsRaw) {
    const n = Number(participantsRaw);
    if (Number.isInteger(n) && n >= 1 && n <= 10000) participants = n;
    else errors.participants = "invalid";
  }

  if (Object.keys(errors).length > 0) return { ok: false, spam: false, errors };
  return {
    ok: true,
    inquiry: { full_name, company: company || null, email, phone, event_date, participants, message },
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildInquiryEmail(inq: CorporateInquiry, receivedAt: Date = new Date()) {
  const received = receivedAt.toLocaleString("en-GB", {
    timeZone: "Asia/Tbilisi",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const rows: [string, string][] = [
    ["Full name", inq.full_name],
    ["Company", inq.company || "—"],
    ["Email", inq.email],
    ["Phone", inq.phone],
    ["Preferred date", inq.event_date || "—"],
    ["Participants", inq.participants != null ? String(inq.participants) : "—"],
    ["Received", `${received} (Tbilisi)`],
  ];

  const tableRows = rows
    .map(([k, v]) => {
      let value = escapeHtml(v);
      if (k === "Email") value = `<a href="mailto:${escapeHtml(v)}" style="color:#1c3fba">${value}</a>`;
      if (k === "Phone") value = `<a href="tel:${escapeHtml(v.replace(/[^\d+]/g, ""))}" style="color:#1c3fba">${value}</a>`;
      return (
        `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;width:38%;vertical-align:top">${k}</td>` +
        `<td style="padding:8px 0;color:#14243e;font-size:14px;font-weight:600">${value}</td></tr>`
      );
    })
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;background:#f0f2f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">
    <div style="background:#14243e;border-radius:16px 16px 0 0;padding:20px 24px">
      <div style="color:#d5f296;font-size:20px;font-weight:800">MatchPoint</div>
      <div style="color:#ffffff;font-size:14px;opacity:.8">New corporate event inquiry</div>
    </div>
    <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:24px">
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:16px">${tableRows}</table>
      <div style="font-size:13px;color:#6b7280;margin-bottom:6px">Message</div>
      <div style="font-size:14px;color:#14243e;line-height:1.55;white-space:pre-wrap;background:#f4f5f7;border-radius:10px;padding:14px">${escapeHtml(inq.message)}</div>
      <p style="margin:20px 0 0;font-size:12px;color:#9ca3af">Reply to this email to answer ${escapeHtml(inq.full_name)} directly.</p>
    </div>
  </div>
</body></html>`;

  const text = [
    "New corporate event inquiry — MatchPoint",
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Message:",
    inq.message,
  ].join("\n");

  const who = inq.company ? `${inq.full_name} (${inq.company})` : inq.full_name;
  return { subject: `Corporate inquiry: ${who}`.slice(0, 180), html, text };
}
