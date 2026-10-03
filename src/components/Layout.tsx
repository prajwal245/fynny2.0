import { ReactNode } from "react";
import Navbar from "./Navbar";
import { SiteFooter } from "./site/SiteShell";
import { SITE_STYLES } from "./site/siteTheme";

const Layout = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen flex flex-col">
    <style>{SITE_STYLES}</style>
    <Navbar />
    <main className="flex-1">{children}</main>
    <SiteFooter />
  </div>
);

export default Layout;
