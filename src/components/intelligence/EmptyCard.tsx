export function EmptyCard({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-fyn-ink/10 bg-fyn-beige/30 p-5">
      <p className="text-sm font-semibold text-fyn-ink/60 mb-1">{title}</p>
      <p className="text-xs text-fyn-ink/40 leading-relaxed">{hint}</p>
    </div>
  );
}
