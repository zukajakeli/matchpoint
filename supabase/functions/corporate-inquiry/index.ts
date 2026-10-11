// Supabase Edge Function: corporate-inquiry
// Receives the /corporate-events form, checks it (validation, honeypot,
// fill time, per-IP rate limit), stores it in corporate_inquiries and
// emails it to the venue through Resend. Answers 200 only once the email
// has actually been accepted, so the site never shows a false success.
//
// Secrets: RESEND_API_KEY (already used for booking emails)
// Optional: INQUIRY_EMAIL_TO (default matchpoint.ge@gmail.com),
//           BOOKING_EMAIL_FROM (sender, shared with booking emails)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/bookingEmail.ts";
import { buildInquiryEmail, validateInquiry } from "../_shared/corporateInquiry.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_PER_IP_PER_HOUR = 3;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function hashIp(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const result = validateInquiry(body);
  if (!result.ok) {
    if (result.spam) return json({ error: "rejected" }, 400);
    return json({ error: "validation", fields: result.errors }, 422);
  }
  const inquiry = result.inquiry;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const ipHash = await hashIp(ip, serviceRoleKey.slice(-16));

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("corporate_inquiries")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if (countError) {
    console.error("corporate-inquiry: rate check failed:", countError);
    return json({ error: "server" }, 500);
  }
  if ((count || 0) >= MAX_PER_IP_PER_HOUR) return json({ error: "rate_limited" }, 429);

  const { data: row, error: insertError } = await supabase
    .from("corporate_inquiries")
    .insert({ ...inquiry, ip_hash: ipHash })
    .select("id, created_at")
    .single();
  if (insertError || !row) {
    console.error("corporate-inquiry: insert failed:", insertError);
    return json({ error: "server" }, 500);
  }

  const recordError = async (message: string) => {
    console.error(`corporate-inquiry: email not sent for ${row.id}: ${message}`);
    await supabase.from("corporate_inquiries").update({ email_error: message.slice(0, 500) }).eq("id", row.id);
  };

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    await recordError("RESEND_API_KEY is not set");
    return json({ error: "email_failed" }, 502);
  }

  const { subject, html, text } = buildInquiryEmail(inquiry, new Date(row.created_at));
  try {
    await sendEmail({
      apiKey,
      from: Deno.env.get("BOOKING_EMAIL_FROM") || "MatchPoint <no-reply@matchpoint.ge>",
      to: Deno.env.get("INQUIRY_EMAIL_TO") || "matchpoint.ge@gmail.com",
      replyTo: inquiry.email,
      subject,
      html,
      text,
    });
  } catch (error) {
    await recordError(error instanceof Error ? error.message : String(error));
    return json({ error: "email_failed" }, 502);
  }

  await supabase
    .from("corporate_inquiries")
    .update({ email_sent_at: new Date().toISOString(), email_error: null })
    .eq("id", row.id);
  return json({ ok: true });
});
