// Supabase Edge Function: create-event-registration
// Validates the event registration, atomically reserves a spot via RPC,
// then creates a Flitt checkout order (for online payment) or returns success (offline).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function buildFlittSignature(
  secretKey: string,
  params: Record<string, string | number>
): Promise<string> {
  const values = Object.keys(params)
    .sort()
    .map((k) => params[k])
    .filter((v) => v !== "" && v !== null && v !== undefined);
  const raw = [secretKey, ...values].join("|");
  const hashBuffer = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(raw));
  return bufToHex(hashBuffer);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const {
      eventId,
      participantName,
      participantEmail,
      participantPhone,
      paymentMethod,     // 'online' or 'offline'
      responseUrl,
      cancelUrl,
    } = await req.json();

    if (!eventId || !participantName || !participantEmail || !participantPhone) {
      return new Response(
        JSON.stringify({ error: "eventId, participantName, participantEmail, and participantPhone are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch event details
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .eq("is_active", true)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: "Event not found or is no longer active" }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Check registration deadline
    if (event.registration_deadline && new Date() > new Date(event.registration_deadline)) {
      return new Response(
        JSON.stringify({ error: "Registration deadline has passed" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const entryFee = Number(event.entry_fee || 0);
    const isOnline = paymentMethod === "online" && entryFee > 0;
    const flittOrderId = isOnline ? crypto.randomUUID() : null;

    // Atomic registration via RPC
    const { data: regId, error: rpcError } = await supabase.rpc(
      "create_event_registration",
      {
        p_event_id: eventId,
        p_name: participantName,
        p_email: participantEmail,
        p_phone: participantPhone,
        p_payment_method: isOnline ? "online" : "offline",
        p_flitt_order_id: flittOrderId,
        p_amount: entryFee,
      }
    );

    if (rpcError) {
      if (rpcError.message?.includes("EVENT_FULL")) {
        return new Response(
          JSON.stringify({ error: "This event is full. Registration closed." }),
          { status: 409, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
      if (rpcError.message?.includes("REGISTRATION_CLOSED")) {
        return new Response(
          JSON.stringify({ error: "Registration deadline has passed." }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
      console.error("RPC error:", JSON.stringify(rpcError));
      return new Response(
        JSON.stringify({ error: "Failed to register", detail: rpcError.message }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // If offline payment or free event, just return success
    if (!isOnline) {
      return new Response(
        JSON.stringify({ registrationId: regId, paymentMethod: "offline" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Build Flitt checkout for online payment
    const merchantId = Number(Deno.env.get("FLITT_MERCHANT_ID")!);
    const secretKey = Deno.env.get("FLITT_SECRET_KEY")!;
    const amountTetri = Math.round(entryFee * 100);
    const orderDesc = `MatchPoint Event: ${event.title}`;
    const callbackUrl = `${supabaseUrl}/functions/v1/flitt-event-callback`;

    const requestParams: Record<string, string | number> = {
      amount: amountTetri,
      currency: "GEL",
      merchant_id: merchantId,
      order_desc: orderDesc,
      order_id: flittOrderId!,
      server_callback_url: callbackUrl,
    };
    if (responseUrl) requestParams.response_url = responseUrl;
    if (cancelUrl) requestParams.cancel_url = cancelUrl;

    const signature = await buildFlittSignature(secretKey, requestParams);

    const flittRes = await fetch("https://pay.flitt.com/api/checkout/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: { ...requestParams, signature } }),
    });

    const flittJson = await flittRes.json();

    if (flittJson?.response?.response_status !== "success") {
      console.error("Flitt API error:", JSON.stringify(flittJson));
      await supabase
        .from("event_registrations")
        .update({ payment_status: "failed" })
        .eq("id", regId);

      return new Response(
        JSON.stringify({ error: "Payment gateway error. Please try again." }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        checkoutUrl: flittJson.response.checkout_url,
        registrationId: regId,
        flittOrderId,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
