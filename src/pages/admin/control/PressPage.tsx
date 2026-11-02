import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminPressDelete, adminPressList, adminPressMeta, adminPressSave } from "@/lib/admin/admin.functions";
import { adminCall, adminError } from "@/components/admin/adminClient";
import { Btn, Empty, ErrorNote, PageHead, Panel, Pill, Table, Td, day, muted } from "./ui";

type Row = {
  id: string; kind: "news" | "release"; outlet: string; headline: string; summary: string | null; url: string; published_on: string;
  logo_url: string | null; logo_invert: boolean | null; image_url: string | null; status: "published" | "hidden"; source: "admin" | "auto";
};

const blank = () => ({
  id: undefined as string | undefined, kind: "news" as "news" | "release", outlet: "", headline: "", summary: "", url: "",
  publishedOn: new Date().toISOString().slice(0, 10), logoUrl: "", logoInvert: false, imageUrl: "", status: "published" as "published" | "hidden",
});
type Form = ReturnType<typeof blank>;

const input = "rounded-lg border px-3 py-2.5 text-[15px] w-full";

export default function PressAdminPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin", "press"], queryFn: () => adminCall(() => adminPressList()) });
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "press"] });

  const fill = async () => {
    if (!form?.url.trim()) return;
    setBusy(true);
    try {
      const m = await adminCall(() => adminPressMeta({ data: { url: form.url } }));
      setForm((f) => f && {
        ...f,
        headline: f.headline || m.headline || "",
        outlet: f.outlet || m.outlet || "",
        summary: f.summary || m.summary || "",
        imageUrl: f.imageUrl || m.image || "",
        publishedOn: m.publishedOn ?? f.publishedOn,
      });
      toast.success("Details read from the article. Check them, then save.");
    } catch (e) {
      toast.error(adminError(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      await adminCall(() => adminPressSave({ data: { ...form, summary: form.summary || null, logoUrl: form.logoUrl || null, imageUrl: form.imageUrl || null } }));
      toast.success(form.id ? "Saved." : "Added. It is on the Press page now.");
      setForm(null);
      await refresh();
    } catch (e) {
      toast.error(adminError(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (r: Row) => {
    try {
      await adminCall(() => adminPressSave({ data: { id: r.id, kind: r.kind, outlet: r.outlet, headline: r.headline, summary: r.summary, url: r.url, publishedOn: r.published_on, logoUrl: r.logo_url, logoInvert: Boolean(r.logo_invert), imageUrl: r.image_url, status: r.status === "published" ? "hidden" : "published" } }));
      await refresh();
    } catch (e) {
      toast.error(adminError(e));
    }
  };

  const remove = async (r: Row) => {
    if (!window.confirm(`Delete "${r.headline}" from the Press page? This cannot be undone. (Hide it instead to keep it.)`)) return;
    try {
      await adminCall(() => adminPressDelete({ data: { id: r.id } }));
      toast.success("Deleted.");
      await refresh();
    } catch (e) {
      toast.error(adminError(e));
    }
  };

  const edit = (r: Row) =>
    setForm({ id: r.id, kind: r.kind, outlet: r.outlet, headline: r.headline, summary: r.summary ?? "", url: r.url, publishedOn: r.published_on, logoUrl: r.logo_url ?? "", logoInvert: Boolean(r.logo_invert), imageUrl: r.image_url ?? "", status: r.status });

  const rows = (list.data ?? []) as unknown as Row[];

  return (
    <div>
      <PageHead
        title="Press & media"
        sub="Articles and press releases shown on fynhelp.com/press, and as logos in the home page “Featured in” strip. Add one by hand here, or let it arrive automatically (see below)."
        action={<Btn kind="primary" onClick={() => setForm(blank())} testId="press-add">Add an article</Btn>}
      />

      {form && (
        <Panel title={form.id ? "Edit article" : "Add an article"} testId="press-form">
          <div className="grid gap-3 max-w-[760px]">
            <label className="grid gap-1 text-[15px]">Article link
              <div className="flex gap-2">
                <input className={input} placeholder="https://…" value={form.url} onChange={(e) => set("url", e.target.value)} aria-label="Article link" />
                <Btn disabled={busy || !form.url.trim()} onClick={() => void fill()} testId="press-fill">Fill from link</Btn>
              </div>
              <span className="text-[13.5px]" style={{ color: muted }}>Paste the link and press “Fill from link”: the headline, outlet, date and image are read from the page.</span>
            </label>
            <label className="grid gap-1 text-[15px]">Headline<input className={input} value={form.headline} onChange={(e) => set("headline", e.target.value)} maxLength={300} /></label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="grid gap-1 text-[15px]">Outlet<input className={input} value={form.outlet} onChange={(e) => set("outlet", e.target.value)} maxLength={120} /></label>
              <label className="grid gap-1 text-[15px]">Published on<input type="date" className={input} value={form.publishedOn} onChange={(e) => set("publishedOn", e.target.value)} /></label>
            </div>
            <label className="grid gap-1 text-[15px]">Short summary (optional)<textarea className={input} rows={2} value={form.summary} onChange={(e) => set("summary", e.target.value)} maxLength={400} /></label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="grid gap-1 text-[15px]">Type
                <select className={input} value={form.kind} onChange={(e) => set("kind", e.target.value as "news" | "release")}>
                  <option value="news">In the news (another outlet)</option>
                  <option value="release">Press release (ours)</option>
                </select>
              </label>
              <label className="grid gap-1 text-[15px]">Visibility
                <select className={input} value={form.status} onChange={(e) => set("status", e.target.value as "published" | "hidden")}>
                  <option value="published">Published</option>
                  <option value="hidden">Hidden</option>
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-[15px]">Outlet logo link (optional)
              <input className={input} placeholder="https://…/logo.png" value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} maxLength={500} />
              <span className="text-[13.5px]" style={{ color: muted }}>With a logo the outlet also appears in the home page strip.</span>
            </label>
            <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" checked={form.logoInvert} onChange={(e) => set("logoInvert", e.target.checked)} /> The logo is white (made for dark backgrounds): show it black</label>
            <label className="grid gap-1 text-[15px]">Image link (optional)<input className={input} value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} maxLength={500} /></label>
            <div className="flex gap-2">
              <Btn kind="primary" disabled={busy || !form.url.trim() || !form.headline.trim() || !form.outlet.trim()} onClick={() => void save()} testId="press-save">{form.id ? "Save changes" : "Add to Press page"}</Btn>
              <Btn onClick={() => setForm(null)}>Cancel</Btn>
            </div>
          </div>
        </Panel>
      )}

      <Panel title={`All articles (${rows.length})`}>
        <ErrorNote error={list.error} />
        {list.data && rows.length === 0 && <Empty>No articles yet. Add the first one above.</Empty>}
        {rows.length > 0 && (
          <Table head={["Date", "Outlet", "Headline", "Type", "Status", ""]} testId="press-table">
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>{day(r.published_on)}</Td>
                <Td>{r.outlet}{r.logo_url ? <div className="text-[13px]" style={{ color: muted }}>logo set</div> : null}</Td>
                <Td><a href={r.url} target={/^https?:/.test(r.url) ? "_blank" : undefined} rel="noopener noreferrer" className="underline">{r.headline}</a>{r.source === "auto" && <span className="ml-2 text-[13px]" style={{ color: muted }}>added automatically</span>}</Td>
                <Td>{r.kind === "release" ? "Press release" : "In the news"}</Td>
                <Td><Pill tone={r.status === "published" ? "good" : "warn"}>{r.status}</Pill></Td>
                <Td>
                  <div className="flex gap-2 flex-wrap">
                    <Btn onClick={() => edit(r)}>Edit</Btn>
                    <Btn onClick={() => void toggle(r)}>{r.status === "published" ? "Hide" : "Show"}</Btn>
                    <Btn kind="danger" onClick={() => void remove(r)}>Delete</Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Panel title="Add articles automatically" testId="press-auto">
        <p className="text-[15px] mb-2">Send the article link to FynHelp from any tool (Zapier, Make, a Google Alerts email workflow, a script) and it appears on the Press page by itself. Only the link is needed; the headline, outlet, date and image are read from the page.</p>
        <pre className="text-[13.5px] rounded-lg p-3 overflow-x-auto" style={{ background: "#F7F3EC" }}>{`POST https://www.fynhelp.com/api/public/press-ingest
x-press-key: <PRESS_INGEST_KEY>
content-type: application/json

{ "url": "https://outlet.com/article" }`}</pre>
        <p className="text-[13.5px] mt-2" style={{ color: muted }}>Set <code>PRESS_INGEST_KEY</code> (a long random value) in Vercel to switch this on. Without it the address refuses everything. Items added this way are marked “added automatically” and can be hidden or edited above.</p>
      </Panel>
    </div>
  );
}
