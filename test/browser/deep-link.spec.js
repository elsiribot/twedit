import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { createDeepLink } from "../../src/deep-link.js";
import { newDraft } from "../../src/model.js";

const tweet = (page) =>
  page.getByRole("textbox", { name: "Tweet 1", exact: true });

test("copies a gzip deep link that restores settings in a fresh browser", async ({
  page,
  context,
  browser,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await tweet(page).fill("Share this 🌿 世界");
  await page.getByRole("button", { name: "Add tweet" }).click();
  await page
    .getByRole("textbox", { name: "Tweet 2", exact: true })
    .fill("Second thought");
  await page.getByRole("button", { name: "Deep link", exact: true }).click();
  await expect(page.locator("#deep-link-status")).toHaveText(
    "Deep link copied to clipboard.",
  );
  const link = await page.locator("#deep-link-url").inputValue();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  expect(new URL(page.url()).hash).toBe("");
  const fresh = await browser.newContext();
  try {
    const recipient = await fresh.newPage();
    await recipient.goto(link);
    await expect(tweet(recipient)).toHaveValue("Share this 🌿 世界");
    await expect(
      recipient.getByRole("textbox", { name: "Tweet 2", exact: true }),
    ).toHaveValue("Second thought");
    await expect(recipient).toHaveURL(/\/$/);
    await tweet(recipient).fill("Later edit");
    await recipient.reload();
    await expect(tweet(recipient)).toHaveValue("Later edit");
  } finally {
    await fresh.close();
  }
});

test("clipboard denial leaves a selectable link and an Escape-dismissable bubble", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("Denied");
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Deep link", exact: true }).click();
  await expect(page.locator("#deep-link-status")).toContainText(
    "automatic clipboard access is unavailable",
  );
  await expect(page.locator("#deep-link-url")).toHaveValue(/#draft=/);
  await expect(page.locator("#deep-link-url")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#deep-link-bubble")).toBeHidden();
  await expect(page.locator("#deep-link")).toBeFocused();
});

test("oversized links show an accessible warning speech bubble on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const text = randomBytes(7500).toString("base64");
  await tweet(page).fill(text);
  await page.getByRole("button", { name: "Deep link", exact: true }).click();
  await expect(page.locator("#deep-link-warning")).toContainText("too long");
  await expect(page.locator("#deep-link-bubble")).toHaveClass(/is-warning/);
  await expect(page.locator("#deep-link-warning")).toHaveAttribute(
    "role",
    "alert",
  );
  await expect(page.locator("#deep-link-url")).toBeHidden();
  await expect(tweet(page)).toHaveValue(text);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const bubble = await page.locator("#deep-link-bubble").boundingBox();
  expect(bubble.x).toBeGreaterThanOrEqual(0);
  expect(bubble.x + bubble.width).toBeLessThanOrEqual(375);
  await page.getByRole("button", { name: "Dismiss" }).click();
  await tweet(page).fill("Short enough");
  await page.getByRole("button", { name: "Deep link", exact: true }).click();
  await expect(page.locator("#deep-link-url")).toBeVisible();
  await expect(page.locator("#deep-link-warning")).toBeHidden();
});

test("malformed fragments preserve saved work and warn", async ({ page }) => {
  await page.goto("/");
  await tweet(page).fill("Keep my draft");
  await page.goto("/#draft=broken");
  await expect(page.locator("#deep-link-warning")).toContainText(
    "Could not open the deep link",
  );
  await expect(tweet(page)).toHaveValue("Keep my draft");
  await page.reload();
  await expect(tweet(page)).toHaveValue("Keep my draft");
});

test("opening a deep link confirms before replacing current work", async ({
  page,
  baseURL,
}) => {
  await page.goto("/");
  await tweet(page).fill("Keep my draft");
  const draft = {
    ...newDraft({ name: "Alex", handle: "alex" }),
    title: "Shared",
    numbering: true,
    tweets: ["Linked thread"],
  };
  const link = await createDeepLink(draft, baseURL);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.goto(link);
  await expect(tweet(page)).toHaveValue("Keep my draft");
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(tweet(page)).toHaveValue("Linked thread");
  await expect(page.locator(".profile-name")).toHaveText("Alex");
  await expect(page.locator(".preview-text")).toContainText("1/1");
});

test("unavailable compression warns without breaking the editor", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.CompressionStream = undefined;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Deep link", exact: true }).click();
  await expect(page.locator("#deep-link-warning")).toContainText(
    "cannot compress deep links",
  );
  await tweet(page).fill("Still editable");
  await expect(page.locator(".preview-text")).toHaveText("Still editable");
});
