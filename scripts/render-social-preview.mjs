import { chromium } from "playwright";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "social-preview.png");
const draftDirectory = path.join(root, "previews");
const width = 1200;
const height = 630;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
});

function documentHtml(inputImage, previewImage) {
  const screenshots =
    inputImage && previewImage
      ? `<div class="input"><img alt="Input: a tweet linking to twedit.net" src="data:image/png;base64,${inputImage.toString("base64")}"></div><div class="preview"><img alt="Live preview with a twedit.net social card" src="data:image/png;base64,${previewImage.toString("base64")}"></div>`
      : '<div class="seed">Twitter / X thread editor<br><span>Write. Preview. Share.</span></div>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Twedit social preview</title><style>
*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}body{background:#fff;color:#111827;font-family:Arial,"DejaVu Sans",sans-serif}.card{position:relative;width:1200px;height:630px;padding:38px 48px}.brand{display:flex;align-items:center;gap:10px;font-size:26px;font-weight:700;letter-spacing:-.7px}.mark{background:#1a48f5;width:7px;height:23px;border-radius:3px}h1{font-size:41px;line-height:1.15;font-weight:700;letter-spacing:-1.6px;margin:29px 0 0;width:555px}h1 span{color:#1a48f5}.input{position:absolute;left:48px;top:225px;width:520px}.preview{position:absolute;left:632px;top:94px;width:520px}.input img{width:520px;max-height:321px;object-fit:contain;object-position:top left}.preview img{width:520px;max-height:507px;object-fit:contain;object-position:top left}.footer{position:absolute;left:48px;right:48px;bottom:28px;display:flex;justify-content:space-between;font-size:17px;color:#667085}.domain{font-weight:600;color:#111827}.seed{margin-top:64px;font-size:39px;font-weight:700}.seed span{color:#1a48f5;font-weight:400;font-size:29px}
</style></head><body><div class="card"><div class="brand"><span class="mark"></span>Twedit</div><h1>Write your thread.<br><span>Preview every tweet.</span></h1>${screenshots}<div class="footer"><span>Free. No login.</span><span class="domain">twedit.net</span></div></div></body></html>`;
}

try {
  const seed = await browser.newPage({ viewport: { width, height } });
  await seed.setContent(documentHtml());
  await seed.screenshot({ path: output });
  await seed.close();
  let html;
  // A few finite passes show the site's own card inside its screenshot without a live embed.
  for (let pass = 0; pass < 3; pass++) {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 950 },
      deviceScaleFactor: 2,
    });
    await page.goto(pathToFileURL(path.join(root, "index.html")).href);
    await page.addStyleTag({
      content:
        'body { font-family: Arial, "DejaVu Sans", sans-serif; } [aria-labelledby="input-heading"] { align-self: start; }',
    });
    await page
      .getByRole("textbox", { name: "Tweet 1", exact: true })
      .fill("A simpler way to write threads.\nhttps://twedit.net");
    await page.locator("textarea").blur();
    await page.locator(".link-image").evaluate((image) => image.decode());
    await page.locator(".link-card.has-image").waitFor();
    const inputImage = await page
      .locator('[aria-labelledby="input-heading"]')
      .screenshot();
    const previewImage = await page
      .locator('[aria-labelledby="preview-heading"]')
      .screenshot();
    html = documentHtml(inputImage, previewImage);
    await page.setViewportSize({ width, height });
    await page.setContent(html);
    await page.screenshot({ path: output, scale: "css" });
    await page.close();
  }
  await fs.mkdir(draftDirectory, { recursive: true });
  await fs.copyFile(output, path.join(draftDirectory, "social-preview.png"));
  await fs.writeFile(path.join(draftDirectory, "social-preview.html"), html);
  console.log(`Rendered ${output} (${width} × ${height}). Nothing published.`);
} finally {
  await browser.close();
}
