import twitterText from "twitter-text";

export const MAX_TWEETS = 100;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const STORAGE_KEY = "twedit.draft.v1";
export function newDraft(
  profile = { name: "Your name", handle: "yourhandle" },
) {
  return {
    version: 1,
    title: "Untitled thread",
    profile: { ...profile },
    numbering: false,
    tweets: [""],
  };
}
export function tweetText(draft, index) {
  return (
    draft.tweets[index] +
    (draft.numbering ? `\n\n${index + 1}/${draft.tweets.length}` : "")
  );
}
export function analyzeTweet(draft, index) {
  const text = tweetText(draft, index);
  const result = twitterText.parseTweet(text);
  const empty = !draft.tweets[index].trim();
  return {
    text,
    length: result.weightedLength,
    valid: !empty && result.valid,
    empty,
  };
}
// Imports are projected onto the schema rather than merged into application state.
export function validateDraft(value) {
  if (!value || typeof value !== "object" || value.version !== 1)
    throw new Error("This is not a supported Twedit file (version 1).");
  if (typeof value.title !== "string" || value.title.length > 100)
    throw new Error("The thread title must be at most 100 characters.");
  if (typeof value.numbering !== "boolean")
    throw new Error("The numbering setting must be true or false.");
  if (
    !value.profile ||
    typeof value.profile.name !== "string" ||
    !value.profile.name.trim() ||
    value.profile.name.length > 50 ||
    typeof value.profile.handle !== "string" ||
    !/^[A-Za-z0-9_]{1,15}$/.test(value.profile.handle)
  )
    throw new Error("The preview profile is invalid.");
  if (
    !Array.isArray(value.tweets) ||
    !value.tweets.length ||
    value.tweets.length > MAX_TWEETS ||
    value.tweets.some((t) => typeof t !== "string" || t.length > 10000)
  )
    throw new Error(
      `Include 1–${MAX_TWEETS} tweets, each a string of at most 10,000 characters.`,
    );
  return {
    version: 1,
    title: value.title,
    profile: { name: value.profile.name, handle: value.profile.handle },
    numbering: value.numbering,
    tweets: [...value.tweets],
  };
}
export function parseDraft(json) {
  let value;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error(
      "That file is not valid JSON. Your current draft has not changed.",
    );
  }
  return validateDraft(value);
}
export function entities(text) {
  return twitterText.extractEntitiesWithIndices(text);
}
