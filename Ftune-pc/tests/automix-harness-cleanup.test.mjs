import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const pcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const harnessUrl = pathToFileURL(path.join(pcRoot, "tests", "automix-harness.mjs")).href;

function runHarnessSubprocess(scriptBody) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", scriptBody], {
    cwd: pcRoot,
    encoding: "utf8",
  });
}

function listLeakedTestBuildBundles() {
  const testBuildDir = path.join(pcRoot, ".test-build");
  if (!fs.existsSync(testBuildDir)) return [];
  return fs.readdirSync(testBuildDir).filter((name) => /^audio-engine-.*\.cjs$/.test(name));
}

test("automix-harness cleans up its temporary bundle on normal exit without writing to .test-build", () => {
  const res = runHarnessSubprocess(`
    import fs from "node:fs";
    import { boot, getBundlePath } from ${JSON.stringify(harnessUrl)};
    const h = await boot({ fadeSeconds: 0 });
    const bundlePath = getBundlePath();
    h.restore();
    if (!bundlePath || !fs.existsSync(bundlePath)) process.exit(2);
    console.log("BUNDLE_PATH=" + bundlePath);
  `);

  assert.equal(res.status, 0, res.stderr || res.stdout);
  const match = res.stdout.match(/BUNDLE_PATH=(.+)/);
  assert.ok(match, `Expected BUNDLE_PATH in output: ${res.stdout}`);
  const bundlePath = match[1].trim();
  assert.equal(fs.existsSync(bundlePath), false, `Temporary bundle should be deleted on exit: ${bundlePath}`);
  assert.equal(fs.existsSync(path.dirname(bundlePath)), false, "Temporary bundle directory should be removed on exit");
  assert.deepEqual(listLeakedTestBuildBundles(), []);
});

test("automix-harness cleans up its temporary bundle even when a test throws or exits non-zero", () => {
  const res = runHarnessSubprocess(`
    import fs from "node:fs";
    import { boot, getBundlePath } from ${JSON.stringify(harnessUrl)};
    const h = await boot({ fadeSeconds: 0 });
    const bundlePath = getBundlePath();
    h.restore();
    if (!bundlePath || !fs.existsSync(bundlePath)) process.exit(2);
    console.log("BUNDLE_PATH=" + bundlePath);
    throw new Error("simulated test failure");
  `);

  assert.notEqual(res.status, 0, "Simulated failure must exit non-zero");
  const match = res.stdout.match(/BUNDLE_PATH=(.+)/);
  assert.ok(match, `Expected BUNDLE_PATH in output: ${res.stdout}`);
  const bundlePath = match[1].trim();
  assert.equal(fs.existsSync(bundlePath), false, `Temporary bundle should be deleted after failure: ${bundlePath}`);
  assert.equal(fs.existsSync(path.dirname(bundlePath)), false, "Temporary bundle directory should be removed after failure");
  assert.deepEqual(listLeakedTestBuildBundles(), []);
});
