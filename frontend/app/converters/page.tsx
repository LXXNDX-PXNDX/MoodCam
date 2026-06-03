"use client";

import Link from "next/link";
import { methods } from "@/data/methods";
import { supabase } from "@/lib/supabase";
import { useEffect, useMemo, useRef, useState } from "react";

type Method = typeof methods[number];
type Job = {
  id: string;
  status: string;
  source_filename: string;
  output_filename: string | null;
  output_path: string | null;
  error_message: string | null;
  created_at: string;
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8787";

function AdSlot({ label }: { label: string }) { return <div className="ad-slot rounded-2xl">{label}</div>; }

function anonId() {
  let id = localStorage.getItem("convertly_anon_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("convertly_anon_id", id);
  }
  return id;
}

export default function ConvertersPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<Method>(methods[0]);
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState("Choose a converter.");
  const [busy, setBusy] = useState(false);
  const [apiStatus, setApiStatus] = useState("checking");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJob, setActiveJob] = useState<Job | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tool = params.get("tool");
    const found = methods.find(m => m.slug === tool);
    if (found) setSelected(found);

    fetch(`${BACKEND_URL}/health`).then(r => r.ok ? setApiStatus("online") : setApiStatus("offline")).catch(() => setApiStatus("offline"));

    refreshJobs();
  }, []);

  async function refreshJobs() {
    const id = anonId();
    const { data } = await supabase
      .from("convertly_jobs")
      .select("id,status,source_filename,output_filename,output_path,error_message,created_at")
      .is("user_id", null)
      .order("created_at", { ascending: false })
      .limit(8);
    if (data) setJobs(data as Job[]);
  }

  const categories = useMemo(() => ["All", ...Array.from(new Set(methods.map(m => m.category)))], []);
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return methods.filter(m => {
      const okCat = category === "All" || m.category === category;
      const okQ = !q || `${m.name} ${m.slug} ${m.category} ${m.description}`.toLowerCase().includes(q);
      return okCat && okQ;
    }).slice(0, 500);
  }, [query, category]);

  function choose(method: Method) {
    setSelected(method);
    setFiles([]);
    setActiveJob(null);
    setStatus(method.status === "ready" ? "Ready." : "Planned converter. Backend route not implemented yet.");
    window.history.replaceState(null, "", `/converters?tool=${method.slug}`);
  }

  function pick(list: FileList | null) {
    const arr = Array.from(list || []);
    setFiles(selected.multi ? arr : arr.slice(0, 1));
    setActiveJob(null);
    setStatus(arr.length ? `${arr.length} file selected.` : "No file selected.");
  }

  async function signedDownload(path: string) {
    const { data, error } = await supabase.storage.from("convertly-outputs").createSignedUrl(path, 60 * 10);
    if (error) {
      setStatus(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function convert() {
    if (selected.status !== "ready") return setStatus("This converter is planned, not connected yet.");
    if (!files.length) return setStatus("Choose a file first.");

    setBusy(true);
    setActiveJob(null);
    setStatus("Uploading to Supabase...");

    try {
      const id = anonId();
      const firstFile = files[0];
      const jobId = crypto.randomUUID();
      const basePath = `anon/${id}/${jobId}`;
      const sourcePath = selected.multi ? `${basePath}/batch.zip-placeholder` : `${basePath}/${firstFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      if (selected.multi) {
        for (const file of files) {
          const p = `${basePath}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          const { error } = await supabase.storage.from("convertly-uploads").upload(p, file, { upsert: false });
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.storage.from("convertly-uploads").upload(sourcePath, firstFile, { upsert: false });
        if (error) throw error;
      }

      setStatus("Creating job...");

      const { data: job, error: insertError } = await supabase
        .from("convertly_jobs")
        .insert({
          id: jobId,
          user_id: null,
          source_filename: selected.multi ? `${files.length} files` : firstFile.name,
          source_mime: selected.multi ? "multiple/files" : firstFile.type,
          source_size: files.reduce((sum, f) => sum + f.size, 0),
          source_path: selected.multi ? basePath : sourcePath,
          converter_slug: selected.slug,
          converter_category: selected.category,
          target_format: selected.target,
          status: "queued"
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setActiveJob(job as Job);
      setStatus("Sending job to backend...");

      const response = await fetch(`${BACKEND_URL}/jobs/${jobId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymousId: id })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Backend error ${response.status}`);
      }

      setStatus("Processing. Waiting for result...");

      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 1500));
        const { data } = await supabase
          .from("convertly_jobs")
          .select("id,status,source_filename,output_filename,output_path,error_message,created_at")
          .eq("id", jobId)
          .single();

        if (data) {
          setActiveJob(data as Job);
          if (data.status === "completed") {
            setStatus("Done.");
            await refreshJobs();
            return;
          }
          if (data.status === "failed") throw new Error(data.error_message || "Job failed.");
        }
      }

      setStatus("Still processing. Refresh job history in a moment.");
      await refreshJobs();
    } catch (error: any) {
      setStatus(error?.message || "Conversion failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid-bg mx-auto min-h-screen max-w-7xl px-5 py-6">
      <nav className="mb-8 flex items-center justify-between border-b border-[var(--line)] pb-5">
        <Link href="/" className="font-mono text-sm text-[var(--muted)]">convertly</Link>
        <div className="flex items-center gap-3">
          <span className={`rounded-full border px-3 py-1 font-mono text-xs ${apiStatus === "online" ? "border-emerald-400/30 text-emerald-300" : "border-red-400/30 text-red-300"}`}>api {apiStatus}</span>
          <Link href="/" className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-bold text-[var(--accent)]">home</Link>
        </div>
      </nav>

      <section className="grid gap-5 lg:grid-cols-[320px_1fr_260px]">
        <aside className="card h-fit rounded-3xl p-4">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="search: mp4, pdf, docx..." className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel2)] px-4 py-3 outline-none focus:border-[var(--accent)]" />
          <div className="mt-4 flex max-h-[150px] flex-wrap gap-2 overflow-auto">
            {categories.map(c => <button key={c} onClick={() => setCategory(c)} className={`rounded-full border px-3 py-1.5 text-xs font-black ${category === c ? "border-[var(--accent)] bg-[var(--accent)] text-black" : "border-[var(--line)] text-[var(--muted)]"}`}>{c}</button>)}
          </div>
          <div className="mt-4 max-h-[560px] space-y-2 overflow-auto">
            {filtered.map(m => <button key={m.slug} onClick={() => choose(m)} className={`tool w-full rounded-xl p-3 text-left ${selected.slug === m.slug ? "border-[var(--accent)]" : ""}`}>
              <div className="flex justify-between gap-2"><b>{m.name}</b><span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${m.status === "ready" ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-[var(--muted)]"}`}>{m.status}</span></div>
              <p className="mt-1 text-xs text-[var(--muted)]">/{m.slug}</p>
            </button>)}
          </div>
        </aside>

        <section className="card rounded-3xl p-4 md:p-6">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-[var(--muted)]">{selected.category}</p>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.06em] md:text-6xl">{selected.name}</h1>
          <p className="mt-3 text-[var(--muted)]">{selected.description}</p>

          <div onClick={() => inputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const arr = Array.from(e.dataTransfer.files); setFiles(selected.multi ? arr : arr.slice(0,1)); setActiveJob(null); setStatus(arr.length ? `${arr.length} file selected.` : "No file."); }} className="mt-6 grid min-h-[260px] cursor-pointer place-items-center rounded-2xl border border-dashed border-[#44444d] bg-[var(--panel2)] p-8 text-center">
            <input ref={inputRef} type="file" accept={selected.accept} multiple={selected.multi} className="hidden" onChange={e => pick(e.target.files)} />
            <div>
              <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-[var(--line)] font-mono text-2xl text-[var(--accent)]">↓</div>
              <h2 className="text-3xl font-black">{selected.status === "ready" ? "Upload to Supabase" : "Planned converter"}</h2>
              <p className="mt-2 text-[var(--muted)]">{selected.status === "ready" ? "Backend will process it after upload" : "listed for future expansion"}</p>
              {!!files.length && <p className="mt-4 font-mono text-sm text-[var(--accent)]">{files.length} file selected</p>}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="font-mono text-sm text-[var(--muted)]">{status}</p>
            <div className="flex gap-3">
              <button onClick={convert} disabled={busy} className="rounded-2xl bg-[var(--accent)] px-7 py-3 font-black text-black disabled:opacity-50">{busy ? "working" : "convert"}</button>
              {activeJob?.status === "completed" && activeJob.output_path && <button onClick={() => signedDownload(activeJob.output_path!)} className="rounded-2xl border border-[var(--line)] px-7 py-3 font-black text-[var(--accent)]">download</button>}
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <AdSlot label="ad slot" />
          <div className="card rounded-3xl p-5">
            <b>Jobs</b>
            <div className="mt-3 space-y-2">
              {jobs.map(job => <div key={job.id} className="rounded-xl border border-[var(--line)] bg-[var(--panel2)] p-3">
                <div className="flex justify-between gap-2"><span className="truncate text-sm font-bold">{job.source_filename}</span><span className="font-mono text-xs text-[var(--muted)]">{job.status}</span></div>
                {job.output_path && <button onClick={() => signedDownload(job.output_path!)} className="mt-2 text-sm font-bold text-[var(--accent)]">download</button>}
              </div>)}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
