import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("minimal two-column layout uses Flowbite styling", async ({ page }) => {
  await expect(
    page.getByRole("heading", { name: "Input", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Preview", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(3);
  const input = await page
    .locator('[aria-labelledby="input-heading"]')
    .boundingBox();
  const preview = await page
    .locator('[aria-labelledby="preview-heading"]')
    .boundingBox();
  expect(preview.x).toBeGreaterThan(input.x + input.width);
  expect(preview.y).toBe(input.y);
  expect(
    await page
      .locator("#add-tweet")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe("rgba(0, 0, 0, 0)");
});

test("live weighted counts and over-limit feedback", async ({ page }) => {
  const tweet = page.getByRole("textbox", { name: "Tweet 1", exact: true });
  await tweet.fill("👨‍👩‍👧‍👦 https://example.com/very-long-path");
  await expect(page.locator("#count-0")).toHaveText("26 / 280");
  await expect(page.locator(".preview-text")).toHaveText(
    "👨‍👩‍👧‍👦 https://example.com/very-long-path",
  );
  await expect(page.locator(".preview-text a")).toHaveAttribute(
    "href",
    "https://example.com/very-long-path",
  );
  await tweet.fill("a".repeat(280));
  await expect(tweet).toHaveAttribute("aria-invalid", "false");
  await tweet.fill("a".repeat(281));
  await expect(tweet).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#error-0")).toContainText("1 character over");
  await tweet.fill("Fixed");
  await expect(page.locator("#error-0")).toBeHidden();
});

test("add, remove and reload a thread", async ({ page }) => {
  await page
    .getByRole("textbox", { name: "Tweet 1", exact: true })
    .fill("First");
  await page.getByRole("button", { name: "Add tweet" }).click();
  await page
    .getByRole("textbox", { name: "Tweet 2", exact: true })
    .fill("Second");
  await expect(page.locator(".preview-tweet")).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Tweet 2", exact: true }),
  ).toHaveValue("Second");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove tweet 1" }).click();
  await expect(
    page.getByRole("textbox", { name: "Tweet 1", exact: true }),
  ).toHaveValue("Second");
  await page
    .getByRole("textbox", { name: "Tweet 1", exact: true })
    .press("Control+Enter");
  await expect(page.locator(".tweet-editor")).toHaveCount(2);
});

test("JSON roundtrip; malformed files leave current work intact", async ({
  page,
}) => {
  await page
    .getByRole("textbox", { name: "Tweet 1", exact: true })
    .fill("A thought worth saving. 🌿");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const exported = await fs.readFile(
    await (await downloadPromise).path(),
    "utf8",
  );
  expect(JSON.parse(exported).tweets).toEqual(["A thought worth saving. 🌿"]);
  await page
    .getByRole("textbox", { name: "Tweet 1", exact: true })
    .fill("Different");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "draft.json",
      mimeType: "application/json",
      buffer: Buffer.from(exported),
    });
  await expect(
    page.getByRole("textbox", { name: "Tweet 1", exact: true }),
  ).toHaveValue("A thought worth saving. 🌿");
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{no"),
    });
  await expect(page.getByRole("status")).toContainText("not valid JSON");
  await expect(
    page.getByRole("textbox", { name: "Tweet 1", exact: true }),
  ).toHaveValue("A thought worth saving. 🌿");
});

test("existing numbered files retain profile, counts and literal text", async ({
  page,
}) => {
  const draft = {
    version: 1,
    title: "Existing thread",
    profile: { name: "Alex Green", handle: "alex_green" },
    numbering: true,
    tweets: ["<img src=x onerror=alert(1)> #hello @someone"],
  };
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "old.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(draft)),
    });
  await expect(page.locator(".profile-name")).toHaveText("Alex Green");
  await expect(page.locator(".preview-text")).toContainText("1/1");
  await expect(page.locator(".preview-text img")).toHaveCount(0);
  await expect(page.locator(".preview-text a")).toHaveCount(2);
});

test("mobile layout and unavailable storage", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Storage disabled");
      },
    });
  });
  await page.reload();
  await page
    .getByRole("textbox", { name: "Tweet 1", exact: true })
    .fill("A mobile thought.");
  await expect(page.locator(".preview-text")).toHaveText("A mobile thought.");
  await expect(page.locator("#storage-warning")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
