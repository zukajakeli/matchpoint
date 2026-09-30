// Booking confirmation email (Georgian + English), sent once a booking is
// paid. Pure template + a small Resend sender so it can be unit-tested.

export interface PaidBooking {
  customer_name: string;
  customer_email: string | null;
  booking_at: string | null;
  hours_count: number | null;
  tables_count: number | null;
  table_ids: number[] | null;
  game_type: string | null;
  amount_charged: number | null;
  masked_card: string | null;
  flitt_order_id: string | null;
}

const VENUE = {
  name: "MatchPoint",
  addressKa: "პეტრე კავთარაძის ქ. 17, თბილისი 0186",
  addressEn: "17 Petre Kavtaradze St, Tbilisi 0186",
  phone: "+995 555 613 330",
  phoneHref: "tel:+995555613330",
};

const GAMES: Record<string, { ka: string; en: string }> = {
  pingpong: { ka: "პინგ-პონგი", en: "Ping-Pong" },
  foosball: { ka: "ფეხბურთის მაგიდა", en: "Foosball" },
  airhockey: { ka: "აეროჰოკეი", en: "Air Hockey" },
  playstation: { ka: "PlayStation", en: "PlayStation" },
};

// Must match src/utils/bookableTables.js
function tableName(id: number, lang: "ka" | "en"): string {
  if (id === 11) return lang === "ka" ? "ფეხბურთის მაგიდა" : "Foosball";
  if (id === 12) return lang === "ka" ? "აეროჰოკეი" : "Air hockey";
  if (id === 13) return "PlayStation";
  return lang === "ka" ? `მაგიდა ${id}` : `Table ${id}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatWhen(iso: string, lang: "ka" | "en"): string {
  return new Date(iso).toLocaleString(lang === "ka" ? "ka-GE" : "en-GB", {
    timeZone: "Asia/Tbilisi",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatHours(hours: number | null, lang: "ka" | "en"): string {
  const h = Number(hours || 1);
  if (lang === "ka") return `${h} სთ`;
  return `${h} ${h === 1 ? "hour" : "hours"}`;
}

function tablesLine(b: PaidBooking, lang: "ka" | "en"): string {
  const ids = (b.table_ids || []).slice().sort((x, y) => x - y);
  if (ids.length > 0) return ids.map((id) => tableName(id, lang)).join(", ");
  const n = b.tables_count || 1;
  return lang === "ka" ? `${n} მაგიდა` : `${n} table${n === 1 ? "" : "s"}`;
}

export function buildBookingConfirmation(b: PaidBooking, siteUrl: string) {
  const game = GAMES[b.game_type || "pingpong"] || GAMES.pingpong;
  const amount = b.amount_charged != null ? `${Number(b.amount_charged).toFixed(2)} ₾` : "—";
  const card = b.masked_card ? `···· ${b.masked_card.slice(-4)}` : null;
  const when = (lang: "ka" | "en") => (b.booking_at ? formatWhen(b.booking_at, lang) : "—");
  const firstName = escapeHtml((b.customer_name || "").trim().split(/\s+/)[0] || "");

  const rows = (lang: "ka" | "en") => {
    const labels =
      lang === "ka"
        ? { when: "თარიღი და დრო", duration: "ხანგრძლივობა", game: "თამაში", tables: "მაგიდა", paid: "გადახდილია", card: "ბარათი", order: "შეკვეთა" }
        : { when: "Date & time", duration: "Duration", game: "Game", tables: "Table", paid: "Paid", card: "Card", order: "Order" };
    const list: [string, string][] = [
      [labels.when, when(lang)],
      [labels.duration, formatHours(b.hours_count, lang)],
      [labels.game, game[lang]],
      [labels.tables, tablesLine(b, lang)],
      [labels.paid, amount],
    ];
    if (card) list.push([labels.card, card]);
    if (b.flitt_order_id) list.push([labels.order, b.flitt_order_id.slice(0, 8).toUpperCase()]);
    return list
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;width:40%">${k}</td>` +
          `<td style="padding:6px 0;color:#14243e;font-size:14px;font-weight:600">${escapeHtml(v)}</td></tr>`
      )
      .join("");
  };

  const section = (lang: "ka" | "en") => {
    const t =
      lang === "ka"
        ? {
            hello: firstName ? `გამარჯობა, ${firstName}!` : "გამარჯობა!",
            intro: "თქვენი ჯავშანი დადასტურებულია. გელოდებით MatchPoint-ში!",
            note: "გთხოვთ, მოხვიდეთ რამდენიმე წუთით ადრე. ცვლილებისთვის დაგვიკავშირდით:",
            address: VENUE.addressKa,
          }
        : {
            hello: firstName ? `Hi ${firstName}!` : "Hi!",
            intro: "Your booking is confirmed. See you at MatchPoint!",
            note: "Please arrive a few minutes early. To change your booking, contact us:",
            address: VENUE.addressEn,
          };
    return `
      <h2 style="margin:0 0 6px;font-size:20px;color:#14243e">${t.hello}</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#374151">${t.intro}</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:12px">${rows(lang)}</table>
      <p style="margin:0;font-size:13px;color:#6b7280">${t.note}
        <a href="${VENUE.phoneHref}" style="color:#1c3fba">${VENUE.phone}</a> · ${t.address}</p>`;
  };

  const html = `<!doctype html>
<html><body style="margin:0;background:#f0f2f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#14243e;border-radius:16px 16px 0 0;padding:20px 24px">
      <div style="color:#d5f296;font-size:20px;font-weight:800">MatchPoint</div>
      <div style="color:#ffffff;font-size:14px;opacity:.8">ჯავშნის დადასტურება · Booking confirmation</div>
    </div>
    <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:24px">
      ${section("ka")}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      ${section("en")}
      <p style="margin:24px 0 0;text-align:center">
        <a href="${siteUrl}" style="display:inline-block;background:#1c3fba;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;font-size:14px">matchpoint.ge</a>
      </p>
    </div>
  </div>
</body></html>`;

  const text = [
    `MatchPoint — ჯავშანი დადასტურებულია / Booking confirmed`,
    ``,
    `${when("ka")} · ${formatHours(b.hours_count, "ka")} · ${game.ka} · ${tablesLine(b, "ka")}`,
    `${when("en")} · ${formatHours(b.hours_count, "en")} · ${game.en} · ${tablesLine(b, "en")}`,
    `${amount}${card ? ` · ${card}` : ""}`,
    ``,
    `${VENUE.addressEn} · ${VENUE.phone}`,
    siteUrl,
  ].join("\n");

  return {
    subject: "ჯავშანი დადასტურებულია · Booking confirmed — MatchPoint",
    html,
    text,
  };
}

// Resend's HTTP API (the same provider used for Supabase Auth SMTP).
export async function sendEmail(opts: {
  apiKey: string;
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      reply_to: opts.replyTo || undefined,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}
