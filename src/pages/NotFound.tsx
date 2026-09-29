import { Link, useLocation } from "@/lib/router-compat";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();
  useEffect(() => {
    console.error("404:", location.pathname);
  }, [location.pathname]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-fyn-beige">
      <div className="text-center max-w-md px-6">
        <div className="text-6xl font-bold text-fyn-red mb-4" style={{ fontFamily: "Oswald, sans-serif" }}>404</div>
        <h1 className="text-2xl font-semibold text-fyn-ink mb-2" style={{ fontFamily: "Raleway, sans-serif" }}>Page not found</h1>
        <p className="text-fyn-ink/60 mb-8" style={{ fontFamily: "Roboto, sans-serif" }}>The page you are looking for does not exist or has been moved.</p>
        <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-fyn-red text-white font-semibold hover:opacity-90 transition-opacity" style={{ fontFamily: "DM Sans, sans-serif" }}>
          Return to Home
        </Link>
      </div>
    </div>
  );
};
export default NotFound;
