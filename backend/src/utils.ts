import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { nanoid } from "nanoid";

export async function makeJobDir() {
  const dir = path.join(os.tmpdir(), `convertly-${nanoid()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}
export async function cleanup(dir: string) { try { await rm(dir, { recursive: true, force: true }); } catch {} }
export function safeName(name: string) { return name.replace(/[^a-zA-Z0-9._-]/g, "_"); }
export async function saveBuffer(buffer: Buffer, dir: string, filename: string) {
  const filePath = path.join(dir, safeName(filename));
  await writeFile(filePath, buffer);
  return filePath;
}
export function run(command: string, args: string[], cwd?: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd });
    let stderr = ""; let stdout = "";
    child.stdout.on("data", d => stdout += d.toString());
    child.stderr.on("data", d => stderr += d.toString());
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(stderr || stdout || `${command} failed`)));
  });
}
export function outputName(original: string, ext: string) {
  const base = safeName(original).replace(/\.[^/.]+$/, "");
  return `${base}-converted.${ext}`;
}
export function mimeFor(ext: string) {
  const m: Record<string,string> = {png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",avif:"image/avif",tiff:"image/tiff",bmp:"image/bmp",pdf:"application/pdf",mp4:"video/mp4",mov:"video/quicktime",webm:"video/webm",mkv:"video/x-matroska",avi:"video/x-msvideo",gif:"image/gif",mp3:"audio/mpeg",wav:"audio/wav",flac:"audio/flac",aac:"audio/aac",ogg:"audio/ogg",m4a:"audio/mp4",zip:"application/zip"};
  return m[ext] || "application/octet-stream";
}
