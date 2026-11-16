import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { boot, flushMicrotasks, read, track } from "./automix-harness.mjs";

const require = createRequire(import.meta.url);

test("seek called immediately after playQueue while stream resolves lands at the target position", async () => {
  const h = await boot({ fadeSeconds: 0 });
  try {
    h.setDuration("handoff1", 240);
    h.engine.usePlayer.getState().playQueue([track("handoff1", 240)], 0, "mobile");
    h.engine.usePlayer.getState().seek(42);
    for (let i = 0; i < 20; i++) await flushMicrotasks(4);
    const live = h.elements.find((e) => e.src === "fake:handoff1" && !e.paused);
    assert.ok(live, "stream should be playing");
    assert.ok(live.currentTime >= 42, `expected >= 42s after handoff seek, got ${live.currentTime}`);
    assert.equal(read(h).playing, true);
  } finally {
    h.restore();
  }
});

test("remoteSync handles handoff command with queue, resolved track, position, and playing=true", async () => {
  const h = await boot({ fadeSeconds: 0 });
  try {
    let remoteCmdHandler = null;
    const pushedStates = [];
    globalThis.window.bytune = {
      ...globalThis.window.bytune,
      onRemoteCommand: (cb) => {
        remoteCmdHandler = cb;
        return () => {};
      },
      remotePushPlayerState: (st) => {
        pushedStates.push(st);
      },
      remotePushLibrary: () => {},
    };

    const { outputFiles } = await build({
      stdin: {
        contents: `export { initRemoteSync } from "./src/lib/remoteSync"; export { usePlayer } from "./src/stores/player";`,
        resolveDir: fileURLToPath(new URL("..", import.meta.url)),
        loader: "tsx",
      },
      bundle: true,
      platform: "node",
      format: "cjs",
      write: false,
      logLevel: "silent",
      external: ["zustand", "zustand/middleware"],
    });
    const mod = { exports: {} };
    const origRequire = require;
    const customRequire = (id) => {
      if (id.endsWith("stores/player") || id === "../stores/player") {
        return { usePlayer: h.engine.usePlayer };
      }
      return origRequire(id);
    };
    new Function("require", "module", "exports", outputFiles[0].text)(customRequire, mod, mod.exports);
    mod.exports.initRemoteSync();
    assert.ok(remoteCmdHandler, "registered remote command handler");

    const t1 = { id: "yt_resolved_1", spotifyId: "sp_abc", title: "Song A", artist: "Artist", duration: 180, thumb: "" };
    const t2 = { id: "sp_def", spotifyId: "sp_def", title: "Song B", artist: "Artist", duration: 200, thumb: "" };
    remoteCmdHandler({
      type: "handoff",
      track: t1,
      queue: [{ ...t1, id: "sp_abc" }, t2],
      startIndex: 0,
      position: 55,
      playing: true,
    });

    await h.advance(800);
    const pState = mod.exports.usePlayer.getState();
    assert.equal(pState.current()?.id, "yt_resolved_1");
    assert.equal(pState.playing, true);
    assert.ok(pState.position >= 55, `position should preserve handoff seek (got ${pState.position})`);
    assert.ok(pushedStates.length > 0, "remote state should be pushed immediately");
  } finally {
    h.restore();
  }
});

test("Windows installer pre-authorizes FTune and port 8765 silently with perMachine elevation", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.build.nsis.perMachine, true);

  const nsh = fs.readFileSync(new URL("../build/installer.nsh", import.meta.url), "utf8");
  assert.match(nsh, /nsExec::ExecToStack 'netsh advfirewall firewall add rule name="FTune" dir=in action=allow program="\$appExe" enable=yes profile=any'/);
  assert.match(nsh, /nsExec::ExecToStack 'netsh advfirewall firewall add rule name="FTune Remote Host" dir=in action=allow protocol=TCP localport=8765 enable=yes profile=any'/);
});
