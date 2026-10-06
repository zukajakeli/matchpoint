import React, { useState } from "react";
import { imagePath, SITE } from "../../seo/seo";

// Image for a blog post / event / product, loaded from /api/image instead of
// shipping base64 inside the list data (the event photo alone was ~730 KB on
// every home page load). Lists don't fetch the image column, so a row
// without an image simply hides itself when the endpoint returns 404.
export default function ContentImage({ type, row, alt, className }) {
  const [failed, setFailed] = useState(false);
  const path = imagePath(type, row);
  if (!path || failed) return null;
  // `vite dev` has no /api functions; use production's.
  const src = import.meta.env.DEV && path.startsWith("/") ? `${SITE.url}${path}` : path;
  return (
    <div className={className}>
      <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </div>
  );
}
