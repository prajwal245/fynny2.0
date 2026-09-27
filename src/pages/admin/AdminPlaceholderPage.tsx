import { Card, PageHeader } from "./AdminDashboardPage";
import { Construction } from "lucide-react";

export default function AdminPlaceholderPage({
  title, subtitle, note,
}: { title: string; subtitle?: string; note?: string }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <Card style={{ minHeight: 320 }}>
        <div className="flex flex-col items-center justify-center text-center py-12">
          <span className="grid place-items-center rounded-full mb-5"
            style={{ width: 72, height: 72, background: "linear-gradient(135deg, rgba(196,30,30,0.1), rgba(139,105,20,0.1))" }}>
            <Construction size={32} color="#8B6914" />
          </span>
          <h3 style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 22, color: "hsl(var(--fyn-ink))" }}>
            Coming soon
          </h3>
          <p className="mt-2 max-w-md" style={{ fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink) / 0.6)" }}>
            {note ?? "This module is part of upcoming work for the admin portal."}
          </p>
        </div>
      </Card>
    </div>
  );
}
