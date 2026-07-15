#!/usr/bin/env node
import { execSync } from "node:child_process";

const port = process.env.PORT || "4000";

function run(cmd) {
  try {
    execSync(cmd, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

// Stop stray backend watchers that keep port 4000 bound
run('pkill -f "tsx watch src/index.ts"');
run(`lsof -ti:${port} | xargs kill -9`);

try {
  execSync("sleep 0.8");
} catch {
  /* ignore */
}
