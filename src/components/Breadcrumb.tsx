import { Link, useLocation } from "@/lib/router-compat";

const routeNames: Record<string, string> = {
  solutions: "Solutions",
  products: "Products",
  pricing: "Pricing",
  resources: "Resources",
  blog: "Blog",
  community: "Community",
  about: "About",
  signup: "Sign Up",
  signin: "Sign In",
};

const Breadcrumb = () => {
  const location = useLocation();
  if (location.pathname === "/") return null;

  const segment = location.pathname.split("/")[1];
  const name = routeNames[segment] || segment;

  return (
    <div className="bg-fyn-beige border-b border-fyn-ink-10">
      <div className="fyn-container py-2">
        <span className="text-fyn-gold text-[13px]">
          <Link to="/" className="hover:underline">← Home</Link>
          <span className="mx-1">/</span>
          <span>{name}</span>
        </span>
      </div>
    </div>
  );
};

export default Breadcrumb;
