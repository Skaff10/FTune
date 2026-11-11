import { spawn } from "child_process";
import electron from "electron";
import fs from "fs";
import path from "path";

// Clean up dangling lockfile if any
const appData = process.env.APPDATA;
if (appData) {
  for (const dir of ["FTune", "ByTune"]) {
    const lockPath = path.join(appData, dir, "lockfile");
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    } catch {}
  }
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

console.log("[launch] Starting FTune Electron without ELECTRON_RUN_AS_NODE...");

const child = spawn(electron, ["."], {
  stdio: "inherit",
  env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
