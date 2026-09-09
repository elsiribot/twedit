import test from "node:test";
import assert from "node:assert/strict";
import {
  newDraft,
  analyzeTweet,
  parseDraft,
  validateDraft,
  MAX_TWEETS,
} from "../src/model.js";

function analyze(text) {
  const draft = newDraft();
  draft.tweets = [text];
  return analyzeTweet(draft, 0);
}
test("accepts exactly 280 ASCII characters and rejects 281", () => {
  assert.equal(analyze("a".repeat(280)).valid, true);
  assert.equal(analyze("a".repeat(281)).valid, false);
  assert.equal(analyze("a".repeat(281)).length, 281);
});
test("URLs count as 23, independently of actual length", () => {
  for (const url of [
    "https://example.com",
    "https://example.com/" + "a".repeat(500),
    "example.com",
  ])
    assert.equal(analyze(url).length, 23);
  assert.equal(analyze("https://example.com https://example.org").length, 47);
});
test("emoji sequences and CJK have weighted lengths", () => {
  for (const emoji of ["😀", "👨‍👩‍👧‍👦", "👍🏽", "🇺🇸"])
    assert.equal(analyze(emoji).length, 2, emoji);
  assert.equal(analyze("漢".repeat(140)).valid, true);
  assert.equal(analyze("漢".repeat(141)).valid, false);
});
test("normalizes composed accents and includes whitespace and mentions", () => {
  assert.equal(analyze("e\u0301").length, 1);
  assert.equal(analyze("@someone #hello\n").length, 16);
});
test("empty, whitespace-only and forbidden characters are invalid", () => {
  for (const text of ["", " \n\t ", "hello\ufffe"])
    assert.equal(analyze(text).valid, false);
});
test("thread numbering is counted, including digit transitions", () => {
  const draft = newDraft();
  draft.numbering = true;
  draft.tweets = Array(10).fill("a".repeat(274));
  assert.equal(analyzeTweet(draft, 0).length, 280);
  assert.equal(analyzeTweet(draft, 9).length, 281);
  assert.equal(analyzeTweet(draft, 9).valid, false);
  draft.tweets[0] = "";
  assert.equal(
    analyzeTweet(draft, 0).valid,
    false,
    "Numbering does not make an empty tweet valid",
  );
});
test("JSON export/import preserves all draft settings and oversized drafts", () => {
  const draft = newDraft({ name: "Jane Doe", handle: "jane_doe" });
  draft.title = "An idea";
  draft.numbering = true;
  draft.tweets = ["😀 https://example.com", "x".repeat(281), ""];
  assert.deepEqual(parseDraft(JSON.stringify(draft)), draft);
});
test("rejects malformed, unsupported and structurally invalid JSON", () => {
  assert.throws(() => parseDraft("{bad"), /not valid JSON/);
  for (const value of [
    null,
    [],
    {},
    { ...newDraft(), version: 2 },
    { ...newDraft(), tweets: [] },
    { ...newDraft(), tweets: [123] },
    { ...newDraft(), tweets: Array(MAX_TWEETS + 1).fill("x") },
    { ...newDraft(), numbering: "false" },
    { ...newDraft(), profile: { name: "Name", handle: "<script>" } },
  ])
    assert.throws(() => validateDraft(value));
});
test("ignores unknown JSON properties and does not mutate the original draft", () => {
  const original = { ...newDraft(), unexpected: "value" };
  const validated = validateDraft(original);
  assert.equal("unexpected" in validated, false);
  validated.tweets.push("test");
  assert.equal(original.tweets.length, 1);
});
