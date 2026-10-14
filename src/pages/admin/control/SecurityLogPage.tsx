import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminAudit } from "@/lib/admin/admin.functions";
import { adminCall } from "@/components/admin/adminClient";
import { ErrorNote, PageHead, Panel, Table, Td, muted, when } from "./ui";

export default function SecurityLogPage() {
  const log = useQuery({ queryKey: ["admin", "audit"], queryFn: () => adminCall(() => adminAudit()), refetchInterval: 30_000 });
  const [q, setQ] = useState("");
  const rows = (log.data ?? []).filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHead title="Security Log" sub="Every admin sign-in, sign-out, refusal and change, written by the server with the person's IP." />
      <Panel>
        <input className="rounded-lg border px-3 py-2 text-sm w-full mb-4" placeholder="Filter by admin, action, firm or IP" value={q} onChange={(e) => setQ(e.target.value)} />
        <ErrorNote error={log.error} />
        <Table head={["When", "Admin", "Action", "Target", "Details", "IP"]} testId="audit-table">
          {rows.map((r) => (
            <tr key={r.id}>
              <Td>{when(r.created_at)}</Td>
              <Td>{r.admin}</Td>
              <Td><b>{r.action}</b></Td>
              <Td className="text-xs">{r.target_type}{r.target_id ? ` · ${r.target_id.slice(0, 8)}` : ""}</Td>
              <Td><code className="text-xs break-all" style={{ color: muted }}>{JSON.stringify(r.details ?? {}).slice(0, 220)}</code></Td>
              <Td mono>{r.ip_address ?? ""}</Td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}
