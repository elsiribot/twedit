import { MAX_FILE_BYTES, parseDraft, validateDraft } from "./model.js";

export const DEEP_LINK_PREFIX = "#draft=";
// Application sharing limit, not a universal browser limit. Keep links practical
// for copying between browsers and apps; larger drafts can still use JSON files.
export const MAX_DEEP_LINK_LENGTH = 8192;

function checkedUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("This page does not have a valid URL for a deep link.");
  }
  if (
    !["https:", "http:", "file:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("This page does not have a supported URL for a deep link.");
  return url;
}

function checkLength(url) {
  if (url.href.length > MAX_DEEP_LINK_LENGTH)
    throw new Error(
      `The deep link is too long (maximum ${MAX_DEEP_LINK_LENGTH.toLocaleString("en-US")} characters). Shorten the thread or use Export JSON instead.`,
    );
}

export async function createDeepLink(draft, baseUrl) {
  const url = checkedUrl(baseUrl);
  if (typeof CompressionStream === "undefined")
    throw new Error(
      "This browser cannot compress deep links. Use Export JSON instead.",
    );
  const json = JSON.stringify(validateDraft(draft));
  const stream = new Blob([json])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    "",
  );
  const payload = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  url.hash = `${DEEP_LINK_PREFIX}${payload}`;
  checkLength(url);
  return url.href;
}

export async function readDeepLink(value) {
  const url = checkedUrl(value);
  if (!url.hash.startsWith(DEEP_LINK_PREFIX)) return null;
  checkLength(url);
  const payload = url.hash.slice(DEEP_LINK_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || payload.length % 4 === 1)
    throw new Error("The deep link is invalid or incomplete.");
  if (typeof DecompressionStream === "undefined")
    throw new Error(
      "This browser cannot open compressed deep links. Import JSON instead.",
    );
  const binary = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const chunks = [];
  let size = 0;
  try {
    // Bound expanded data before collecting it, just as file imports are bounded.
    while (true) {
      const { value: chunk, done } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > MAX_FILE_BYTES) {
        await reader.cancel();
        throw new Error("Expanded draft exceeds the import limit.");
      }
      chunks.push(chunk);
    }
  } catch {
    throw new Error(
      "The deep link contains invalid or oversized gzip data. Use Import JSON instead.",
    );
  } finally {
    reader.releaseLock();
  }
  return parseDraft(await new Blob(chunks).text());
}
