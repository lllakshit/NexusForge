export function PlaceholderPage({ title, note }: { title: string; note: string }) {
  return (
    <section className="rounded-xl border border-nf-line bg-nf-panel p-6">
      <h2 className="text-2xl font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm text-nf-muted">{note}</p>
    </section>
  );
}
