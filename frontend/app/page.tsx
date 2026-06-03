import Link from "next/link";
import { methods } from "@/data/methods";

function AdSlot({ label }: { label: string }) { return <div className="ad-slot rounded-2xl">{label}</div>; }

export default function Home() {
  const ready = methods.filter(m => m.status === "ready").length;
  const planned = methods.filter(m => m.status === "planned").length;
  return (
    <main className="grid-bg mx-auto min-h-screen max-w-7xl px-5 py-6">
      <nav className="mb-12 flex items-center justify-between border-b border-[var(--line)] pb-5">
        <div className="font-mono text-sm text-[var(--muted)]">convertly</div>
        <Link href="/converters" className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-bold text-[var(--accent)]">open converter</Link>
      </nav>
      <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="card rounded-3xl p-6 md:p-10">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--muted)]">supabase + backend</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-black tracking-[-0.07em] md:text-8xl">Files in. Backend out.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)]">
            Cloudflare only shows the UI. Supabase stores files and jobs. The backend does every conversion.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/converters" className="rounded-2xl bg-[var(--accent)] px-6 py-4 font-black text-black">Start converting</Link>
            <span className="rounded-2xl border border-[var(--line)] px-6 py-4 font-mono text-sm text-[var(--muted)]">no browser converts</span>
          </div>
        </div>
        <AdSlot label="ad slot" />
      </section>
      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="card rounded-2xl p-5"><b className="text-3xl">{ready}</b><p className="text-[var(--muted)]">backend-ready</p></div>
        <div className="card rounded-2xl p-5"><b className="text-3xl">{planned}</b><p className="text-[var(--muted)]">planned</p></div>
        <div className="card rounded-2xl p-5"><b className="text-3xl">{methods.length}</b><p className="text-[var(--muted)]">total tools</p></div>
      </section>
    </main>
  );
}
