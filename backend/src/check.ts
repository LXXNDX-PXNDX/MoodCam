import { spawnSync } from "node:child_process";
for (const [cmd,args] of [["ffmpeg",["-version"]],["pdftoppm",["-v"]],["soffice",["--version"]],["7z",[]]] as [string,string[]][]) {
  const r = spawnSync(cmd,args,{encoding:"utf-8"});
  console.log(r.error ? `Missing: ${cmd}` : `Found: ${cmd}`);
}
