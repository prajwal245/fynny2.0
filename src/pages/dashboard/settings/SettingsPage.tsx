import DashboardLayout from "@/components/DashboardLayout";
import { Link, useLocation, Outlet } from "@/lib/router-compat";
import { User, Lock, Bell, Globe, Building2, Users, Plug, CreditCard, Star, Briefcase, ChevronRight } from "lucide-react";

const settingsNav = [
  {
    title: "ACCOUNT",
    items: [
      { label: "Personal Information", icon: User, href: "/dashboard/settings/personal" },
      { label: "Security & Password", icon: Lock, href: "/dashboard/settings/security" },
      { label: "Notifications", icon: Bell, href: "/dashboard/settings/notifications" },
      { label: "Language & Region", icon: Globe, href: "/dashboard/settings/language" },
    ],
  },
  {
    title: "BUSINESS",
    items: [
      { label: "Business Profile", icon: Building2, href: "/dashboard/settings/business" },
      { label: "Team & Access", icon: Users, href: "/dashboard/settings/team" },
      { label: "CA Access", icon: Briefcase, href: "/dashboard/settings/ca-access" },
      { label: "Integrations", icon: Plug, href: "/dashboard/settings/integrations" },
    ],
  },
  {
    title: "BILLING",
    items: [
      { label: "Billing", icon: CreditCard, href: "/dashboard/settings/billing" },
    ],
  },
];

const SettingsOverview = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <SettingsCard
      icon={<User size={32} />}
      iconColor="#C41E1E"
      title="Personal Information"
      sub="Name, email, phone, profile photo"
      status="Complete ✓"
      statusColor="#16A34A"
      href="/dashboard/settings/profile"
      linkText="Edit →"
    />
    <SettingsCard
      icon={<Building2 size={32} />}
      iconColor="#C41E1E"
      title="Business Profile"
      sub="GSTIN, turnover, industry, entity type"
      status="80% complete"
      statusColor="#8B5A00"
      href="/dashboard/settings/business"
      linkText="Edit →"
    />
    <SettingsCard
      icon={<Star size={32} />}
      iconColor="#8B6914"
      title="Early Access Plan"
      sub="You have full access during our early access period. No payment required."
      statusChip
      href="/dashboard/settings/billing"
      linkText="Manage plan →"
    />
    <SettingsCard
      icon={<Plug size={32} />}
      iconColor="#C41E1E"
      title="Connected integrations"
      sub="1 bank · Tally connected · GSP active"
      status="3 of 8 connected"
      statusColor="#8B5A00"
      href="/dashboard/settings/integrations"
      linkText="Manage →"
    />
  </div>
);

const SettingsCard = ({
  icon, iconColor, title, sub, status, statusColor, statusChip, href, linkText
}: {
  icon: React.ReactNode; iconColor: string; title: string; sub: string;
  status?: string; statusColor?: string; statusChip?: boolean; href: string; linkText: string;
}) => (
  <Link
    to={href}
    className="bg-card border rounded-lg p-6 hover:shadow-lg hover:border-[#C41E1E] hover:-translate-y-[3px] transition-all duration-250 block"
    style={{ borderColor: "#E0D9C8" }}
  >
    <div className="flex items-start gap-4">
      <div style={{ color: iconColor }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-[15px]" style={{ color: "#171208" }}>{title}</h3>
        <p className="text-[13px] mt-1" style={{ color: "rgba(23,18,8,0.60)" }}>{sub}</p>
        {statusChip ? (
          <span className="inline-flex items-center gap-1 mt-3 px-3 py-1 rounded-full text-[10px] font-semibold tracking-widest"
            style={{ background: "rgba(139,105,20,0.20)", border: "1px solid rgba(139,105,20,0.40)", color: "#8B6914" }}>
            ★ EARLY ACCESS
          </span>
        ) : status && (
          <span className="inline-block mt-3 text-[12px] font-medium" style={{ color: statusColor }}>{status}</span>
        )}
      </div>
    </div>
    <div className="text-right mt-4">
      <span className="text-[13px] font-medium" style={{ color: "#C41E1E" }}>{linkText}</span>
    </div>
  </Link>
);

const SettingsLayout = () => {
  const location = useLocation();
  const isRoot = location.pathname === "/dashboard/settings";

  const currentItem = settingsNav
    .flatMap((g) => g.items)
    .find((i) => i.href === location.pathname);
  const currentLabel = currentItem?.label ?? "Overview";

  return (
    <DashboardLayout>
      <div className="mb-6">
        <nav className="flex items-center gap-1.5 text-[12px] mb-2" style={{ color: "rgba(23,18,8,0.55)" }}>
          <Link to="/dashboard/settings" className="hover:underline" style={{ color: "#8B6914" }}>Settings</Link>
          {!isRoot && (
            <>
              <ChevronRight size={12} />
              <span style={{ color: "rgba(23,18,8,0.75)" }}>{currentLabel}</span>
            </>
          )}
        </nav>
        <h1 className="font-serif text-4xl font-bold" style={{ color: "#171208" }}>Settings</h1>
        <p className="text-sm mt-1" style={{ color: "rgba(23,18,8,0.60)" }}>
          Manage your account, business profile, and subscription.
        </p>
      </div>


      <div className="flex gap-0 min-h-[calc(100vh-240px)]">
        {/* Settings sidebar nav */}
        <aside className="hidden lg:block w-[220px] flex-shrink-0 bg-card border-r sticky top-[120px] self-start" style={{ borderColor: "#E0D9C8" }}>
          <nav className="py-6">
            {settingsNav.map((group) => (
              <div key={group.title} className="mb-5">
                <p className="px-5 mb-2 text-[10px] font-semibold tracking-[0.10em]" style={{ color: "#8B6914" }}>{group.title}</p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className="flex items-center gap-2.5 h-10 px-5 text-[13px] font-medium transition-all duration-150"
                      style={{
                        color: active ? "#C41E1E" : "rgba(23,18,8,0.65)",
                        background: active ? "#FDF2F1" : "transparent",
                        borderRight: active ? "2px solid #C41E1E" : "2px solid transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = "#FAF7F0";
                          e.currentTarget.style.color = "#171208";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "rgba(23,18,8,0.65)";
                        }
                      }}
                    >
                      <Icon size={16} style={{ color: active ? "#C41E1E" : "rgba(23,18,8,0.40)" }} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 lg:pl-8">
          {isRoot ? <SettingsOverview /> : <Outlet />}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SettingsLayout;
