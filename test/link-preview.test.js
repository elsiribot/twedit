import test from "node:test";
import assert from "node:assert/strict";
import { firstLink, remotePreviewUrl } from "../src/link-preview.js";

test("finds the first URL, including bare domains, and removes fragments", () => {
  assert.equal(
    firstLink("Try twedit.net and https://example.com").href,
    "https://twedit.net/",
  );
  assert.equal(
    firstLink("https://example.com/post#section").href,
    "https://example.com/post",
  );
  assert.equal(firstLink("Just a thought. #hello"), null);
});

test("preview URL policy rejects non-HTTPS, credentialed, and local/IP URLs", () => {
  assert.equal(
    remotePreviewUrl("/image.png", "https://example.com/post"),
    "https://example.com/image.png",
  );
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,test",
    "http://example.com",
    "https://localhost",
    "https://a.local",
    "https://127.0.0.1",
    "https://2130706433",
    "https://[::1]",
    "https://user:password@example.com",
    "https://example.com:8080",
  ]) {
    assert.equal(remotePreviewUrl(value), null, value);
  }
});

test("a card replaces only a trailing URL, not prose or additional links", async () => {
  const { textWithoutTrailingCardLink } =
    await import("../src/link-preview.js");
  assert.equal(
    textWithoutTrailingCardLink("A thought.\nhttps://twedit.net"),
    "A thought.",
  );
  assert.equal(textWithoutTrailingCardLink("https://twedit.net"), "");
  assert.equal(
    textWithoutTrailingCardLink("Visit https://twedit.net for details"),
    "Visit https://twedit.net for details",
  );
  assert.equal(
    textWithoutTrailingCardLink("https://twedit.net https://example.com"),
    "https://twedit.net https://example.com",
  );
});
