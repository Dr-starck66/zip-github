import test from "node:test";
import assert from "node:assert/strict";
import { readWithFailover, persistWithFailover } from "./memory-guard.mjs";

test("read falls back when native memory is unavailable", async () => {
  const r = await readWithFailover({
    nativeRead: async () => { throw new Error("disabled"); },
    libraryRead: async () => ({ rules: ["ok"] }),
    githubRead: async () => ({ rules: ["backup"] }),
  });
  assert.equal(r.state, "PASS");
  assert.equal(r.source, "chatgpt_library");
});

test("persist is PASS only after redundant readback", async () => {
  const saved = {};
  const rule = { id: "x", text: "remember me" };
  const r = await persistWithFailover(rule, {
    nativeWrite: async () => { throw new Error("disabled"); },
    nativeRead: async () => { throw new Error("disabled"); },
    libraryWrite: async x => { saved.library = x; },
    libraryRead: async () => saved.library,
    githubWrite: async x => { saved.github = x; },
    githubRead: async () => saved.github,
  });
  assert.equal(r.state, "PASS");
  assert.equal(r.verified, 2);
});

test("persist is not PASS without readback proof", async () => {
  const r = await persistWithFailover({ id: "x" }, {
    libraryWrite: async () => true,
    libraryRead: async () => null,
  });
  assert.equal(r.state, "UNVERIFIED");
});
