import { useEffect } from "react";
import { useLocation } from "@/lib/router-compat";
import { trackPageView } from "@/lib/analytics";

export function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname, {
      search: location.search,
      hash: location.hash,
    });
  }, [location.pathname, location.search]);
}
