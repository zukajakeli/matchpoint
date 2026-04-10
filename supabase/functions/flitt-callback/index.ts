// Supabase Edge Function: flitt-callback
// Receives server-to-server POST from Flitt after payment is processed.
// Verifies the SHA1 signature then updates the booking status.
// Always returns HTTP 200 — Flitt retries on any non-2xx response.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Convert an ArrayBuffer to a lowercase hex string.
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha1Hex(input: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return bufToHex(hashBuffer);
}

// Flitt signature verification:
// SHA1( secretKey | sorted_non_empty_non_signature_values | separated_by_pipe )
async function verifyFlittSignature(
  secretKey: string,
  params: Record<string, unknown>,
  receivedSignature: string
): Promise<boolean> {
  const filtered = Object.keys(params)
    .filter((k) => k !== "signature" && k !== "response_signature_string")
    .sort()
    .map((k) => params[k])
    .filter((v) => v !== "" && v !== null && v !== undefined);

  const raw = [secretKey, ...filtered].join("|");
  const computed = await sha1Hex(raw);
  return computed.toLowerCase() === receivedSignature.toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  let body: Record<string, unknown> = {};

  try {
    const text = await req.text();
    const parsed = JSON.parse(text);
    body = parsed?.response ?? parsed;
  } catch {
    console.error("flitt-callback: Failed to parse request body");
    return new Response("OK", { status: 200 });
  }

  const secretKey = Deno.env.get("FLITT_SECRET_KEY")!;
  const receivedSig = body.signature as string | undefined;

  if (!receivedSig) {
    console.error("flitt-callback: No signature in callback");
    return new Response("OK", { status: 200 });
  }

  const valid = await verifyFlittSignature(secretKey, body, receivedSig);
  if (!valid) {
    console.error("flitt-callback: Signature mismatch — ignoring callback");
    return new Response("OK", { status: 200 });
  }

  const orderId = body.order_id as string | undefined;
  const orderStatus = body.order_status as string | undefined;
  const paymentId = body.payment_id as string | number | undefined;
  const maskedCard = body.masked_card as string | undefined;

  if (!orderId) {
    console.error("flitt-callback: Missing order_id");
    return new Response("OK", { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: existing } = await supabase
    .from("bookings")
    .select("id, payment_status")
    .eq("flitt_order_id", orderId)
    .single();

  if (!existing) {
    console.error(`flitt-callback: No booking found for order_id ${orderId}`);
    return new Response("OK", { status: 200 });
  }

  if (existing.payment_status === "paid") {
    return new Response("OK", { status: 200 });
  }

  let newStatus: string;
  if (orderStatus === "approved") {
    newStatus = "paid";
  } else if (["declined", "expired", "reversed"].includes(orderStatus ?? "")) {
    newStatus = "failed";
  } else {
    return new Response("OK", { status: 200 });
  }

  const updatePayload: Record<string, unknown> = { payment_status: newStatus };
  if (paymentId) updatePayload.flitt_payment_id = String(paymentId);
  if (maskedCard) updatePayload.masked_card = maskedCard;

  const { error: updateError } = await supabase
    .from("bookings")
    .update(updatePayload)
    .eq("flitt_order_id", orderId);

  if (updateError) {
    console.error("flitt-callback: Failed to update booking:", updateError);
  } else {
    console.log(`flitt-callback: booking ${existing.id} → ${newStatus}`);
  }

  return new Response("OK", { status: 200 });
});
