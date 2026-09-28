// Vercel function: where Flitt sends the customer back after checkout.
//
// Flitt returns the browser with a form POST, but the site is a static SPA
// that only answers GET (a POST to /book/success is a 405). This accepts the
// POST (or GET) and 303-redirects to the real page as a GET, carrying the
// order id so the page can show the booking status.
//
//   /api/flitt-return?to=/book/success   (payment finished)
//   /api/flitt-return?to=/book/cancelled (customer cancelled)

// Only same-site paths, so this can't be used as an open redirect.
export function safeTarget(to) {
  if (typeof to !== "string" || !to.startsWith("/") || to.startsWith("//") || to.includes("\\")) {
    return "/";
  }
  return to;
}

function readBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return Object.fromEntries(new URLSearchParams(body));
    }
  }
  return body;
}

export function buildReturnLocation(query = {}, rawBody) {
  const body = readBody(rawBody);
  const target = new URL(safeTarget(query.to), "https://site.invalid");
  const orderId = body.order_id || body.response?.order_id || query.order_id;
  if (orderId && !target.searchParams.has("order_id")) {
    target.searchParams.set("order_id", String(orderId));
  }
  return target.pathname + target.search;
}

function redirect(request, rawBody) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  return new Response(null, {
    status: 303, // "See Other": the browser follows with a GET
    headers: {
      Location: buildReturnLocation(query, rawBody),
      "Cache-Control": "no-store",
    },
  });
}

// Flitt's form POST (application/x-www-form-urlencoded)
export async function POST(request) {
  return redirect(request, await request.text());
}

export function GET(request) {
  return redirect(request);
}
