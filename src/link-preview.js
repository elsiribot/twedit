import { entities } from "./model.js";

const PREVIEW_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_CACHE_ENTRIES = 100;
const cache = new Map();

export function firstLink(text) {
  const entity = entities(text).find((entity) => entity.url);
  if (!entity) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(entity.url) ? entity.url : `https://${entity.url}`,
    );
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

// Reject non-HTTPS, credentialed, and obvious local/IP URLs before requesting.
export function remotePreviewUrl(value, base) {
  try {
    const url = new URL(value, base);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    )
      return null;
    if (
      !host.includes(".") ||
      /^[\d.]+$/.test(host) ||
      host.includes(":") ||
      /\.(localhost|local|internal|test|invalid)$/.test(host)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function readMetadata(root, baseUrl) {
  const meta = (key) =>
    root
      .querySelector(`meta[property="${key}" i], meta[name="${key}" i]`)
      ?.getAttribute("content")
      ?.trim() || "";
  const rawImage = meta("og:image") || meta("twitter:image");
  return {
    title: (
      meta("og:title") ||
      meta("twitter:title") ||
      root.querySelector("title")?.textContent?.trim() ||
      ""
    ).slice(0, 200),
    image: rawImage ? remotePreviewUrl(rawImage, baseUrl) : null,
    imageAlt: (meta("og:image:alt") || meta("twitter:image:alt")).slice(0, 300),
  };
}

async function fetchMetadata(url) {
  const target = remotePreviewUrl(url);
  if (!target) throw new Error("Only public HTTPS links can load a preview.");
  const response = await fetch(target, {
    mode: "cors",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
    headers: { Accept: "text/html" },
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("text/html") ||
    !response.body
  )
    throw new Error("The site did not return a readable HTML page.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        html += decoder.decode();
        break;
      }
      bytes += value.byteLength;
      if (bytes > MAX_HTML_BYTES)
        throw new Error("The page metadata is too large.");
      html += decoder.decode(value, { stream: true });
      if (/<\/head\s*>/i.test(html)) break;
    }
  } finally {
    await reader.cancel();
  }
  // Template contents remain inert: remote scripts, images, and frames are never mounted.
  const template = document.createElement("template");
  template.innerHTML = html;
  const metadata = readMetadata(template.content, target);
  if (!metadata.title && !metadata.image)
    throw new Error("This page does not provide preview metadata.");
  return metadata;
}

function load(url) {
  if (cache.has(url)) return cache.get(url);
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  const pending = fetchMetadata(url).then(
    (metadata) => ({ metadata }),
    () => ({
      error:
        "Preview unavailable. The site may block browser access or redirects.",
    }),
  );
  cache.set(url, pending);
  return pending;
}

// Keep prose and additional links intact; the card replaces only a trailing URL.
export function textWithoutTrailingCardLink(text) {
  const entity = entities(text).find((entity) => entity.url);
  if (!entity || text.slice(entity.indices[1]).trim()) return text;
  return text.slice(0, entity.indices[0]).trimEnd();
}

export function createLinkPreview(text, onImageStateChange = () => {}) {
  const url = firstLink(text);
  if (!url) return null;
  const card = document.createElement("div");
  card.className = "link-preview mt-3";
  const link = document.createElement("a");
  link.className = "link-card block border border-default";
  link.href = url.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const title = document.createElement("p");
  title.className = "link-title";
  title.textContent = url.hostname;
  link.append(title);
  const domain = document.createElement("p");
  domain.className = "link-domain mt-1 text-sm text-body";
  domain.textContent = `From ${url.hostname.replace(/^www\./, "")}`;
  card.append(link, domain);

  function showMetadata(metadata, local = false) {
    title.textContent = metadata.title || url.hostname;
    title.title = title.textContent;
    if (metadata.image) {
      const image = document.createElement("img");
      image.className = "link-image";
      image.alt = metadata.imageAlt;
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      if (!local) image.crossOrigin = "anonymous";
      image.addEventListener(
        "load",
        () => {
          link.classList.add("has-image");
          onImageStateChange(true);
        },
        { once: true },
      );
      image.addEventListener(
        "error",
        () => {
          image.remove();
          link.classList.remove("has-image");
          onImageStateChange(false);
        },
        { once: true },
      );
      image.src = metadata.image;
      link.prepend(image);
    }
  }

  const isHome =
    ["twedit.net", "www.twedit.net"].includes(url.hostname) &&
    url.pathname === "/";
  if (isHome) {
    const metadata = readMetadata(document.head, "https://twedit.net/");
    // The local asset also works offline and before the custom domain is deployed.
    metadata.image = new URL("social-preview.png", document.baseURI).href;
    showMetadata(metadata, true);
    return card;
  }

  const controls = document.createElement("div");
  controls.className = "mt-2 text-xs text-body";
  const button = document.createElement("button");
  button.className = "font-medium text-fg-brand hover:underline";
  button.textContent = "Load link preview";
  button.title = `Contacts ${url.hostname} directly. No proxy; only this URL is sent.`;
  controls.append(button);
  card.append(controls);
  const target = remotePreviewUrl(url.href);
  if (!target) {
    controls.textContent = "Only public HTTPS links can load a preview.";
    return card;
  }

  async function populate() {
    controls.textContent = "Loading preview…";
    controls.setAttribute("role", "status");
    const result = await load(target);
    if (!card.isConnected) return;
    if (result.error) {
      controls.textContent = result.error;
    } else {
      showMetadata(result.metadata);
      controls.remove();
    }
  }
  button.addEventListener("click", populate);
  // Reuse explicitly requested previews across edits without refetching on every keystroke.
  if (cache.has(target)) queueMicrotask(populate);
  return card;
}
