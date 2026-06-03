import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { cleanup, makeJobDir, mimeFor, outputName, run, safeName, saveBuffer } from "./utils.js";

const PORT = Number(process.env.PORT || 8787);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY || SERVICE_KEY.includes("PASTE_")) {
  console.warn("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const app = express();

app.use(helmet());
app.use(cors({ origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN }));
app.use(express.json({ limit: "2mb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 100 }));

app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

async function updateJob(id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("convertly_jobs").update(patch).eq("id", id);
  if (error) throw error;
}

async function downloadUpload(pathName: string) {
  const { data, error } = await supabase.storage.from("convertly-uploads").download(pathName);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

async function uploadOutput(pathName: string, buffer: Buffer, contentType: string) {
  const { error } = await supabase.storage.from("convertly-outputs").upload(pathName, buffer, { contentType, upsert: true });
  if (error) throw error;
}

async function convertImage(input: Buffer, filename: string, target: string) {
  const ext = target === "jpeg" ? "jpg" : target;
  const pipe = sharp(input).rotate();
  let out: Buffer;
  if (target === "jpg" || target === "jpeg") out = await pipe.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  else if (target === "webp") out = await pipe.webp({ quality: 88 }).toBuffer();
  else if (target === "avif") out = await pipe.avif({ quality: 70 }).toBuffer();
  else if (target === "tiff") out = await pipe.tiff({ quality: 90 }).toBuffer();
  else if (target === "bmp") out = await pipe.bmp().toBuffer();
  else out = await pipe.png({ compressionLevel: 9 }).toBuffer();
  return { buffer: out, filename: outputName(filename, ext), ext };
}

async function processFileJob(job: any) {
  const target = job.target_format;
  const input = await downloadUpload(job.source_path);
  const routeType = routeTypeFromSlug(job.converter_slug, job.converter_category);

  if (routeType === "image") return await convertImage(input, job.source_filename, target);

  const dir = await makeJobDir();
  try {
    const inputFile = await saveBuffer(input, dir, job.source_filename);

    if (routeType === "video") {
      const outName = outputName(job.source_filename, target);
      const outPath = path.join(dir, outName);
      const args = ["-y","-i",inputFile,"-map_metadata","-1"];
      if (target === "webm") args.push("-c:v","libvpx-vp9","-b:v","0","-crf","32","-c:a","libopus");
      else if (target === "gif") args.push("-vf","fps=12,scale=720:-1:flags=lanczos");
      else args.push("-c:v","libx264","-preset","veryfast","-crf","23","-c:a","aac","-b:a","160k","-movflags","+faststart");
      args.push(outPath);
      await run("ffmpeg", args, dir);
      return { buffer: await readFile(outPath), filename: outName, ext: target };
    }

    if (routeType === "audio") {
      const outName = outputName(job.source_filename, target);
      const outPath = path.join(dir, outName);
      const args = ["-y","-i",inputFile,"-vn"];
      if (target === "mp3") args.push("-codec:a","libmp3lame","-q:a","2");
      else if (target === "wav") args.push("-codec:a","pcm_s16le");
      else if (target === "flac") args.push("-codec:a","flac");
      else if (target === "ogg") args.push("-codec:a","libvorbis","-q:a","5");
      else args.push("-codec:a","aac","-b:a","192k");
      args.push(outPath);
      await run("ffmpeg", args, dir);
      return { buffer: await readFile(outPath), filename: outName, ext: target };
    }

    if (routeType === "pdf-to-jpg") {
      const prefix = path.join(dir, "page");
      await run("pdftoppm", ["-jpeg","-r","180","-singlefile","-f","1","-l","1",inputFile,prefix], dir);
      const jpg = (await readdir(dir)).find(f => f.startsWith("page") && f.endsWith(".jpg"));
      if (!jpg) throw new Error("No JPG generated.");
      return { buffer: await readFile(path.join(dir, jpg)), filename: outputName(job.source_filename, "jpg"), ext: "jpg" };
    }

    if (routeType === "office-to-pdf") {
      await run("soffice", ["--headless","--convert-to","pdf","--outdir",dir,inputFile], dir);
      const pdf = (await readdir(dir)).find(f => f.toLowerCase().endsWith(".pdf"));
      if (!pdf) throw new Error("No PDF generated.");
      return { buffer: await readFile(path.join(dir, pdf)), filename: outputName(job.source_filename, "pdf"), ext: "pdf" };
    }

    if (routeType === "archive-extract") {
      const extractDir = path.join(dir, "extracted");
      const zipOut = path.join(dir, "extracted.zip");
      await run("7z", ["x", inputFile, `-o${extractDir}`, "-y"], dir);
      await run("7z", ["a", "-tzip", zipOut, path.join(extractDir, "*")], dir);
      return { buffer: await readFile(zipOut), filename: "extracted.zip", ext: "zip" };
    }

    throw new Error("Unsupported route type.");
  } finally {
    await cleanup(dir);
  }
}

async function processBatchJob(job: any) {
  if (job.converter_slug !== "images-to-pdf") throw new Error("Unsupported batch job.");
  const { data: list, error } = await supabase.storage.from("convertly-uploads").list(job.source_path.replace(/^\/+|\/+$/g, ""));
  if (error) throw error;
  if (!list?.length) throw new Error("No batch files found.");

  const pdf = await PDFDocument.create();

  for (const file of list) {
    const p = `${job.source_path}/${file.name}`;
    const buf = await downloadUpload(p);
    const jpg = await sharp(buf).rotate().jpeg({ quality: 92 }).toBuffer();
    const img = await pdf.embedJpg(jpg);
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }

  const bytes = await pdf.save();
  return { buffer: Buffer.from(bytes), filename: "convertly-images.pdf", ext: "pdf" };
}

function routeTypeFromSlug(slug: string, category: string) {
  if (slug === "images-to-pdf") return "images-to-pdf";
  if (slug === "pdf-to-jpg") return "pdf-to-jpg";
  if (category === "Image") return "image";
  if (category === "Video") return "video";
  if (category === "Audio") return "audio";
  if (category === "Office") return "office-to-pdf";
  if (category === "Archive") return "archive-extract";
  return "future";
}

app.post("/jobs/:id/process", async (req, res) => {
  const jobId = req.params.id;
  try {
    const { data: job, error } = await supabase.from("convertly_jobs").select("*").eq("id", jobId).single();
    if (error) throw error;
    if (!job) return res.status(404).json({ error: "Job not found." });

    await updateJob(jobId, { status: "processing", error_message: null });

    const result = job.converter_slug === "images-to-pdf"
      ? await processBatchJob(job)
      : await processFileJob(job);

    const ownerFolder = job.user_id || "anon";
    const outputPath = `${ownerFolder}/${job.id}/${safeName(result.filename)}`;

    await uploadOutput(outputPath, result.buffer, mimeFor(result.ext));

    await updateJob(jobId, {
      status: "completed",
      output_filename: result.filename,
      output_mime: mimeFor(result.ext),
      output_size: result.buffer.length,
      output_path: outputPath,
      completed_at: new Date().toISOString()
    });

    res.json({ ok: true, outputPath });
  } catch (e: any) {
    try { await updateJob(jobId, { status: "failed", error_message: e.message || "Conversion failed." }); } catch {}
    res.status(500).json({ error: e.message || "Conversion failed." });
  }
});

app.listen(Number(process.env.PORT || 8787), () => {
  console.log(`Convertly Supabase Backend running on http://localhost:${process.env.PORT || 8787}`);
});
