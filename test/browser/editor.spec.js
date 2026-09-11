import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("search metadata identifies the canonical public site", async ({
  page,
}) => {
  await expect(page).toHaveTitle("Twedit — Twitter / X Thread Editor");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Write and preview Twitter / X threads with accurate character counts. Free, no login, local autosave, and JSON import/export.",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://twedit.net/",
  );
  await expect(
    page.getByText(/Write and preview Twitter \/ X threads/),
  ).toBeVisible();
});

test("minimal two-column layout uses Flowbite styling", async ({ page }) => {
  await expect(
    page.getByRole("heading", { name: "Input", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Preview", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(5);
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
  await page.locator("#import-file").setInputFiles({
    name: "draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(exported),
  });
  await expect(
    page.getByRole("textbox", { name: "Tweet 1", exact: true }),
  ).toHaveValue("A thought worth saving. 🌿");
  await page.locator("#import-file").setInputFiles({
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
  await page.locator("#import-file").setInputFiles({
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

test("twedit.net gets a local social card without changing the character count", async ({
  page,
}) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname === "twedit.net")
      externalRequests.push(request.url());
  });
  await page
    .getByRole("textbox", { name: "Tweet 1", exact: true })
    .fill("Try https://twedit.net");
  await expect(page.locator("#count-0")).toHaveText("27 / 280");
  await expect(page.locator(".link-title")).toHaveText(
    "Twedit — Twitter / X Thread Editor",
  );
  await expect(page.locator(".link-preview > a")).toHaveAttribute(
    "href",
    "https://twedit.net/",
  );
  await expect(page.locator(".link-image")).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".link-image").evaluate((image) => image.naturalWidth),
    )
    .toBe(1200);
  expect(externalRequests).toEqual([]);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://twedit.net/social-preview.png",
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
});

test("external previews are opt-in, read metadata safely, and reuse the cached result", async ({
  page,
  context,
}) => {
  let loads = 0;
  await context.addCookies([
    {
      name: "private",
      value: "secret",
      domain: "preview.example.com",
      path: "/",
      secure: true,
    },
  ]);
  await page.route("https://preview.example.com/post", async (route) => {
    loads++;
    expect(route.request().headers().cookie).toBeUndefined();
    expect(route.request().headers().referer).toBeUndefined();
    await route.fulfill({
      contentType: "text/html",
      headers: { "access-control-allow-origin": "*" },
      body: '<head><meta property="og:title" content="A useful article"><meta property="og:description" content="&lt;img src=x onerror=alert(1)&gt;"><meta property="og:image" content="/image.png"><script>window.remoteScriptRan = true</script></head>',
    });
  });
  await page.route("https://preview.example.com/image.png", (route) =>
    route.fulfill({
      contentType: "image/png",
      headers: { "access-control-allow-origin": "*" },
      path: "social-preview.png",
    }),
  );
  const input = page.getByRole("textbox", { name: "Tweet 1", exact: true });
  await input.fill("https://preview.example.com/post");
  expect(loads).toBe(0);
  await page.getByRole("button", { name: "Load link preview" }).click();
  await expect(page.locator(".link-title")).toHaveText("A useful article");
  await expect(page.locator(".link-description")).toHaveCount(0);
  expect(await page.evaluate(() => window.remoteScriptRan)).toBeUndefined();
  await expect(page.locator(".link-image")).toHaveAttribute(
    "src",
    "https://preview.example.com/image.png",
  );
  await input.fill("Read https://preview.example.com/post");
  await expect(page.locator(".link-title")).toHaveText("A useful article");
  expect(loads).toBe(1);
});

test("unavailable previews keep a clickable URL and do not corrupt the draft", async ({
  page,
}) => {
  await page.route("https://blocked.example.com/**", (route) => route.abort());
  await page
    .getByRole("textbox", { name: "Tweet 1", exact: true })
    .fill("https://blocked.example.com/article");
  await page.getByRole("button", { name: "Load link preview" }).click();
  await expect(page.locator(".link-preview")).toContainText(
    "Preview unavailable",
  );
  await expect(page.locator(".link-preview > a")).toHaveAttribute(
    "href",
    "https://blocked.example.com/article",
  );
  await expect(page.locator(".preview-text")).toHaveText(
    "https://blocked.example.com/article",
  );
});

test("a delayed preview cannot overwrite a newer URL", async ({ page }) => {
  let release;
  let requested;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    requested = resolve;
  });
  await page.route("https://slow.example.com/", async (route) => {
    requested();
    await gate;
    await route.fulfill({
      contentType: "text/html",
      headers: { "access-control-allow-origin": "*" },
      body: "<title>Old article</title>",
    });
  });
  const input = page.getByRole("textbox", { name: "Tweet 1", exact: true });
  await input.fill("https://slow.example.com");
  await page.getByRole("button", { name: "Load link preview" }).click();
  await started;
  await input.fill("https://twedit.net");
  const response = page.waitForResponse("https://slow.example.com/");
  release();
  await response;
  await expect(page.locator(".link-title")).toHaveText(
    "Twedit — Twitter / X Thread Editor",
  );
  await input.fill("No links now");
  await expect(page.locator(".link-preview")).toHaveCount(0);
});

test("Twitter metadata fallback rejects unsafe images and still works on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("https://fallback.example.com/", (route) =>
    route.fulfill({
      contentType: "text/html",
      headers: { "access-control-allow-origin": "*" },
      body: '<head><title>HTML title</title><meta name="twitter:title" content="Twitter title"><meta name="description" content="Plain description"><meta name="twitter:image" content="javascript:alert(1)"></head>',
    }),
  );
  await page
    .getByRole("textbox", { name: "Tweet 1", exact: true })
    .fill("https://fallback.example.com");
  await page.getByRole("button", { name: "Load link preview" }).click();
  await expect(page.locator(".link-title")).toHaveText("Twitter title");
  await expect(page.locator(".link-description")).toHaveCount(0);
  await expect(page.locator(".link-image")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("image cards put the title over the image and the source underneath", async ({
  page,
}) => {
  await page
    .getByRole("textbox", { name: "Tweet 1", exact: true })
    .fill("A simpler way to write threads.\nhttps://twedit.net");
  const card = page.locator(".link-card");
  await expect(card).toHaveClass(/has-image/);
  await expect(page.locator(".link-domain")).toHaveText("From twedit.net");
  await expect(page.locator(".link-description")).toHaveCount(0);
  await expect(page.locator(".preview-text")).toHaveText(
    "A simpler way to write threads.",
  );
  await expect(page.locator("#count-0")).toHaveText("55 / 280");
  const image = await page.locator(".link-image").boundingBox();
  const title = await page.locator(".link-title").boundingBox();
  const domain = await page.locator(".link-domain").boundingBox();
  expect(title.y).toBeGreaterThan(image.y);
  expect(title.y + title.height).toBeLessThan(image.y + image.height);
  expect(domain.y).toBeGreaterThanOrEqual(image.y + image.height);
  expect(
    await page
      .locator(".link-title")
      .evaluate((el) => getComputedStyle(el).color),
  ).toBe("rgb(255, 255, 255)");
});

test("broken preview images leave a readable title and preserve the URL", async ({
  page,
}) => {
  await page.route("**/social-preview.png", (route) => route.abort());
  await page
    .getByRole("textbox", { name: "Tweet 1", exact: true })
    .fill("https://twedit.net");
  await expect(page.locator(".link-image")).toHaveCount(0);
  await expect(page.locator(".link-title")).toBeVisible();
  await expect(page.locator(".link-card")).not.toHaveClass(/has-image/);
  await expect(page.locator(".preview-text")).toHaveText("https://twedit.net");
  await expect(page.locator(".link-domain")).toHaveText("From twedit.net");
  expect(
    await page
      .locator(".link-title")
      .evaluate((el) => getComputedStyle(el).position),
  ).toBe("static");
});

test("Clear resets the entire thread and persists the empty draft", async ({
  page,
}) => {
  await page
    .getByRole("textbox", { name: "Tweet 1", exact: true })
    .fill("A thought https://twedit.net");
  await page.getByRole("button", { name: "Add tweet" }).click();
  await page
    .getByRole("textbox", { name: "Tweet 2", exact: true })
    .fill("Another thought");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".tweet-editor")).toHaveCount(1);
  await expect(
    page.getByRole("textbox", { name: "Tweet 1", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("textbox", { name: "Tweet 1", exact: true }),
  ).toBeFocused();
  await expect(page.locator("#count-0")).toHaveText("0 / 280");
  await expect(page.locator(".link-preview")).toHaveCount(0);
  await expect(page.locator(".preview-text")).toHaveText(
    "Your tweet will appear here.",
  );
  await page.reload();
  await expect(page.locator(".tweet-editor")).toHaveCount(1);
  await expect(
    page.getByRole("textbox", { name: "Tweet 1", exact: true }),
  ).toHaveValue("");
});

test("cancelling Clear preserves the thread", async ({ page }) => {
  await page
    .getByRole("textbox", { name: "Tweet 1", exact: true })
    .fill("Keep this thought");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Tweet 1", exact: true }),
  ).toHaveValue("Keep this thought");
  await expect(page.locator(".preview-text")).toHaveText("Keep this thought");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Tweet 1", exact: true }),
  ).toHaveValue("Keep this thought");
});

test("Clear removes extra empty tweets without confirmation", async ({
  page,
}) => {
  let confirmations = 0;
  page.on("dialog", (dialog) => {
    confirmations++;
    return dialog.dismiss();
  });
  await page.getByRole("button", { name: "Add tweet" }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".tweet-editor")).toHaveCount(1);
  expect(confirmations).toBe(0);
});
