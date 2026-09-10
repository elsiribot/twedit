import {
  createLinkPreview,
  textWithoutTrailingCardLink,
} from "./link-preview.js";
import {
  newDraft,
  analyzeTweet,
  parseDraft,
  entities,
  MAX_TWEETS,
  MAX_FILE_BYTES,
  STORAGE_KEY,
} from "./model.js";

const $ = (id) => document.getElementById(id);
let draft = newDraft();
let storageAvailable = true;

function notify(message) {
  $("notice").textContent = message;
  $("notice").hidden = !message;
}

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) draft = parseDraft(saved);
} catch (error) {
  storageAvailable = false;
  notify(`Could not restore the draft: ${error.message}`);
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  $("storage-warning").hidden = storageAvailable;
}

function renderEditors(focusIndex) {
  $("tweet-editors").replaceChildren();
  draft.tweets.forEach((text, index) => {
    const article = document.createElement("article");
    article.className = "tweet-editor";
    article.dataset.index = index;
    article.innerHTML = `<textarea class="block min-h-48 w-full resize-y rounded-base border border-default bg-neutral-secondary-medium p-4 text-sm leading-6 text-heading placeholder:text-body focus:border-brand focus:ring-brand" maxlength="10000" rows="6" aria-label="Tweet ${index + 1}" placeholder="${index === 0 ? "What’s on your mind?" : "Add to your thread…"}" aria-describedby="count-${index} error-${index}" spellcheck="true"></textarea><div class="mt-2 flex min-h-5 items-center justify-between text-xs text-body"><span>${index + 1}</span><div class="flex items-center gap-4"><span id="count-${index}" aria-live="polite"></span></div></div><p id="error-${index}" class="mt-2 text-xs text-fg-danger" hidden></p>`;
    article.querySelector("textarea").value = text;
    if (draft.tweets.length > 1) {
      const remove = document.createElement("button");
      remove.className = "hover:text-fg-danger hover:underline";
      remove.textContent = "Remove";
      remove.dataset.remove = index;
      remove.setAttribute("aria-label", `Remove tweet ${index + 1}`);
      article.querySelector(".gap-4").prepend(remove);
    }
    $("tweet-editors").append(article);
  });
  update();
  if (focusIndex !== undefined) {
    $("tweet-editors").children[focusIndex]?.querySelector("textarea").focus();
  }
}

function appendRichText(container, text) {
  let position = 0;
  for (const entity of entities(text).sort(
    (a, b) => a.indices[0] - b.indices[0],
  )) {
    const [start, end] = entity.indices;
    if (start < position) continue;
    container.append(document.createTextNode(text.slice(position, start)));
    const link = document.createElement("a");
    link.textContent = text.slice(start, end);
    link.className = "text-fg-brand hover:underline";
    if (entity.url) {
      link.href = /^https?:\/\//i.test(entity.url)
        ? entity.url
        : `https://${entity.url}`;
    } else if (entity.hashtag) {
      link.href = `https://x.com/hashtag/${encodeURIComponent(entity.hashtag)}`;
    } else if (entity.screenName) {
      link.href = `https://x.com/${encodeURIComponent(entity.screenName)}`;
    } else {
      container.append(document.createTextNode(text.slice(start, end)));
      position = end;
      continue;
    }
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    container.append(link);
    position = end;
  }
  container.append(document.createTextNode(text.slice(position)));
}

function renderPreview(results) {
  $("preview").replaceChildren();
  results.forEach((result) => {
    const tweet = document.createElement("article");
    tweet.className = "preview-tweet min-h-48 p-5";
    tweet.innerHTML =
      '<div class="flex flex-wrap items-baseline gap-x-2 text-sm"><strong class="profile-name break-all font-semibold"></strong><span class="profile-handle break-all text-body"></span></div><p class="preview-text mt-3 whitespace-pre-wrap wrap-anywhere text-sm leading-6"></p>';
    tweet.querySelector(".profile-name").textContent = draft.profile.name;
    tweet.querySelector(".profile-handle").textContent =
      `@${draft.profile.handle}`;
    const text = tweet.querySelector(".preview-text");
    if (result.empty) {
      text.classList.add("text-body");
      text.textContent = "Your tweet will appear here.";
    } else appendRichText(text, result.text);
    const linkPreview = createLinkPreview(result.text, (hasImage) => {
      if (!tweet.isConnected) return;
      const displayText = hasImage
        ? textWithoutTrailingCardLink(result.text)
        : result.text;
      text.replaceChildren();
      text.hidden = !displayText;
      appendRichText(text, displayText);
    });
    if (linkPreview) tweet.append(linkPreview);
    $("preview").append(tweet);
  });
}

function update() {
  const results = draft.tweets.map((_, index) => analyzeTweet(draft, index));
  results.forEach((result, index) => {
    const invalid = !result.empty && !result.valid;
    const article = $("tweet-editors").children[index];
    article
      .querySelector("textarea")
      .setAttribute("aria-invalid", String(invalid));
    const counter = $(`count-${index}`);
    counter.textContent = `${result.length} / 280`;
    counter.classList.toggle("text-fg-danger", invalid);
    const error = $(`error-${index}`);
    error.hidden = !invalid;
    const excess = result.length - 280;
    error.textContent =
      excess > 0
        ? `${excess} ${excess === 1 ? "character" : "characters"} over the limit. Shorten this tweet before posting.`
        : "This tweet contains characters Twitter does not allow.";
  });
  $("add-tweet").disabled = draft.tweets.length >= MAX_TWEETS;
  $("storage-warning").hidden = storageAvailable;
  renderPreview(results);
}

function addTweet() {
  if (draft.tweets.length >= MAX_TWEETS) return;
  draft.tweets.push("");
  save();
  renderEditors(draft.tweets.length - 1);
}

$("tweet-editors").addEventListener("input", (event) => {
  if (!event.target.matches("textarea")) return;
  draft.tweets[Number(event.target.closest(".tweet-editor").dataset.index)] =
    event.target.value;
  save();
  update();
});
$("tweet-editors").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  const index = Number(button.dataset.remove);
  if (draft.tweets[index].trim() && !window.confirm("Remove this tweet?"))
    return;
  draft.tweets.splice(index, 1);
  save();
  renderEditors(Math.min(index, draft.tweets.length - 1));
});
$("tweet-editors").addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    addTweet();
  }
});
$("add-tweet").addEventListener("click", addTweet);

$("export").addEventListener("click", () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(draft, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download =
    (draft.title
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "twedit-thread") + ".json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("import").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > MAX_FILE_BYTES)
      throw new Error("Choose a JSON file smaller than 8 MB.");
    const imported = parseDraft(await file.text());
    if (
      draft.tweets.some((text) => text.trim()) &&
      !window.confirm(
        "Replace the current thread? Export it first if you want to keep a copy.",
      )
    )
      return;
    draft = imported;
    save();
    renderEditors();
    notify("");
  } catch (error) {
    notify(error.message);
  }
});

renderEditors();
