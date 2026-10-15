// Meta (Facebook) Pixel. Loaded from code rather than pasted into
// index.html so that it (1) reports a PageView on every in-app navigation —
// the SPA never reloads, so the stock snippet would count only the first
// page — and (2) never runs on the staff portal.

export const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || "3679217335588385";

const STAFF_PATHS = /^\/(staff|superadmin)(\/|$)/;

export function isTrackedPath(pathname) {
  return !STAFF_PATHS.test(pathname);
}

// Meta's base code, unchanged apart from formatting.
function loadPixel() {
  if (window.fbq) return;
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  window.fbq("init", META_PIXEL_ID);
}

let lastTrackedUrl = null;

export function trackPageView(url) {
  if (!META_PIXEL_ID || typeof window === "undefined") return;
  if (url === lastTrackedUrl) return; // StrictMode / re-render guard
  lastTrackedUrl = url;
  loadPixel();
  window.fbq("track", "PageView");
}
