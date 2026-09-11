import test from "node:test";
import assert from "node:assert/strict";
import { gunzipSync, gzipSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import {
  createDeepLink,
  readDeepLink,
  MAX_DEEP_LINK_LENGTH,
} from "../src/deep-link.js";
import { newDraft } from "../src/model.js";

const base = "https://twedit.net/editor?mode=edit#old";
const linkFromJson = (json) =>
  `https://twedit.net/#draft=${gzipSync(json).toString("base64url")}`;

test("deep links contain gzip JSON and roundtrip Unicode and all settings", async () => {
  const draft = {
    ...newDraft({ name: "Zoë", handle: "zoe" }),
    title: "A thread",
    numbering: true,
    tweets: ["Hello 🌿 世界\n#tag", "", "a".repeat(10000)],
  };
  const link = await createDeepLink(draft, base);
  const url = new URL(link);
  assert.equal(url.search, "?mode=edit");
  assert.match(url.hash, /^#draft=[A-Za-z0-9_-]+$/);
  assert.deepEqual(
    JSON.parse(gunzipSync(Buffer.from(url.hash.slice(7), "base64url"))),
    draft,
  );
  assert.deepEqual(await readDeepLink(link), draft);
});

test("unrelated anchors do not import a draft", async () => {
  assert.equal(await readDeepLink(base), null);
});

test("invalid, truncated, non-gzip and invalid schema links are rejected", async () => {
  for (const payload of [
    "",
    "a",
    "%%%",
    "abcd",
    gzipSync("{}").toString("base64url").slice(0, -4),
  ]) {
    await assert.rejects(readDeepLink(`https://twedit.net/#draft=${payload}`));
  }
  await assert.rejects(
    readDeepLink(linkFromJson("not json")),
    /not valid JSON/,
  );
  await assert.rejects(
    readDeepLink(linkFromJson("{}")),
    /not a supported Twedit file/,
  );
});

test("invalid base URLs and unsupported schemes are rejected", async () => {
  for (const url of [
    "bad url",
    "javascript:void(0)",
    "data:text/html,test",
    "https://user:pass@twedit.net/",
  ]) {
    await assert.rejects(createDeepLink(newDraft(), url), /URL/);
  }
});

test("length limit covers the complete URL, with an inclusive boundary", async () => {
  const draft = newDraft();
  const short = await createDeepLink(draft, "https://twedit.net/");
  const exactBase = `https://twedit.net/${"a".repeat(MAX_DEEP_LINK_LENGTH - short.length)}`;
  const exact = await createDeepLink(draft, exactBase);
  assert.equal(exact.length, MAX_DEEP_LINK_LENGTH);
  assert.deepEqual(await readDeepLink(exact), draft);
  await assert.rejects(createDeepLink(draft, `${exactBase}a`), /too long/);
  await assert.rejects(
    readDeepLink(exact.replace("#draft=", "a#draft=")),
    /too long/,
  );
});

test("incompressible drafts over the sharing limit are rejected", async () => {
  const draft = {
    ...newDraft(),
    tweets: [randomBytes(7500).toString("base64")],
  };
  await assert.rejects(createDeepLink(draft, base), /too long/);
});
