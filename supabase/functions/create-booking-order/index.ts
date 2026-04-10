// Supabase Edge Function: create-booking-order
// Validates the booking request, atomically reserves the slot via RPC,
// then creates a Flitt checkout order and returns the redirect URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Convert an ArrayBuffer to a lowercase hex string.
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Flitt signature: SHA1( secretKey | param1 | param2 | ... )
// Params are sorted alphabetically by key; empty/null values are excluded.
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

// Quarter-hour validation: minutes must be 0, 15, 30, or 45
function isQuarterHour(date: Date): boolean {
  return [0, 15, 30, 45].includes(date.getUTCMinutes());
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
      customerName,
      customerEmail,
      customerPhone,
      tablesCount,
      hoursCount,
      bookingAt,
      gameType,
      responseUrl,
      cancelUrl,
    } = await req.json();

    // --- Basic input validation ---
    if (!customerName || !customerEmail || !customerPhone) {
      return new Response(
        JSON.stringify({ error: "customerName, customerEmail and customerPhone are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
    if (!tablesCount || tablesCount < 1) {
      return new Response(JSON.stringify({ error: "tablesCount must be >= 1" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (!hoursCount || hoursCount <= 0) {
      return new Response(JSON.stringify({ error: "hoursCount must be > 0" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (!bookingAt) {
      return new Response(JSON.stringify({ error: "bookingAt is required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const bookingDate = new Date(bookingAt);
    if (isNaN(bookingDate.getTime())) {
      return new Response(JSON.stringify({ error: "bookingAt is not a valid date" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- Minimum lead time: 1 hour from now ---
    const minLeadMs = 60 * 60 * 1000;
    if (bookingDate.getTime() - Date.now() < minLeadMs) {
      return new Response(
        JSON.stringify({ error: "Bookings must be made at least 1 hour in advance" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // --- Quarter-hour slot validation ---
    if (!isQuarterHour(bookingDate)) {
      return new Response(
        JSON.stringify({ error: "Booking time must be on the hour or at :15, :30, or :45" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // --- Determine rate (GEL/hr per table) ---
    const ratePerTablePerHour =
      gameType === "foosball" || gameType === "airhockey" ? 12 : 16;
    const amountGel = tablesCount * hoursCount * ratePerTablePerHour;
    const amountTetri = Math.round(amountGel * 100);

    // --- Supabase client (service role to bypass RLS) ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // --- Generate a unique order ID for Flitt ---
    const flittOrderId = crypto.randomUUID();

    // --- Atomic slot check + insert via RPC ---
    const { data: bookingId, error: rpcError } = await supabase.rpc(
      "create_online_booking",
      {
        p_customer_name: customerName,
        p_customer_email: customerEmail,
        p_customer_phone: customerPhone,
        p_tables_count: Number(tablesCount),
        p_hours_count: Number(hoursCount),
        p_booking_at: bookingDate.toISOString(),
        p_game_type: gameType || "pingpong",
        p_flitt_order_id: flittOrderId,
        p_amount_charged: amountGel,
      }
    );

    if (rpcError) {
      if (rpcError.message?.includes("SLOT_UNAVAILABLE")) {
        return new Response(
          JSON.stringify({ error: "No tables available for that time slot" }),
          { status: 409, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
      console.error("RPC error:", JSON.stringify(rpcError));
      return new Response(
        JSON.stringify({ error: "Failed to reserve slot", detail: rpcError.message ?? rpcError }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    // --- Build Flitt checkout request ---
    const merchantId = Number(Deno.env.get("FLITT_MERCHANT_ID")!);
    const secretKey = Deno.env.get("FLITT_SECRET_KEY")!;

    const orderDesc = `MatchPoint: ${tablesCount} table(s) x ${hoursCount}h`;
    const callbackUrl = `${supabaseUrl}/functions/v1/flitt-callback`;

    // Build the FULL set of params first — signature must cover every field sent.
    const requestParams: Record<string, string | number> = {
      amount: amountTetri,
      currency: "GEL",
      merchant_id: merchantId,
      order_desc: orderDesc,
      order_id: flittOrderId,
      server_callback_url: callbackUrl,
    };

    if (responseUrl) requestParams.response_url = responseUrl;
    if (cancelUrl) requestParams.cancel_url = cancelUrl;

    // Sign ALL params in one pass, then attach the signature.
    const signature = await buildFlittSignature(secretKey, requestParams);

    const flittBody = {
      request: {
        ...requestParams,
        signature,
      },
    };

    const flittRes = await fetch("https://pay.flitt.com/api/checkout/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(flittBody),
    });

    const flittJson = await flittRes.json();

    if (flittJson?.response?.response_status !== "success") {
      console.error("Flitt API error:", JSON.stringify(flittJson));
      await supabase
        .from("bookings")
        .update({ payment_status: "failed" })
        .eq("flitt_order_id", flittOrderId);

      return new Response(
        JSON.stringify({
          error: "Payment gateway error. Please try again.",
          detail: flittJson?.response?.error_message ?? flittJson?.response ?? flittJson,
        }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        checkoutUrl: flittJson.response.checkout_url,
        bookingId,
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
