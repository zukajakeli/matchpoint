import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { isTrackedPath, trackPageView } from "../analytics/metaPixel";

// One PageView per page the visitor opens on the public site.
export default function MetaPixel() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (isTrackedPath(pathname)) trackPageView(pathname + search);
  }, [pathname, search]);

  return null;
}
