import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// The router keeps the scroll position between pages, so a link clicked at
// the bottom of one page opened the next one at the bottom too. Start every
// new page at the top (or at #anchor if the link has one). Back/forward
// (POP) is left alone so the browser restores where you were.
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (navigationType === "POP") return;
    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash, navigationType]);

  return null;
}
