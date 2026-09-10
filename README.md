# Twedit

A minimal, static Twitter/X thread editor: input on the left, live preview on the right, and an **Add tweet** button. Styled with [Flowbite](https://flowbite.com/docs/getting-started/quickstart/) and Tailwind CSS, compiled locally. No backend, account, analytics, or third-party preview proxy. App assets are bundled locally.

## Use

Open `index.html` directly, or run `npm start` (Python 3 required) and visit http://localhost:3000. Built assets are included; installing dependencies is not necessary to use the page.

- Add tweets with the button or Ctrl/Cmd + Enter. Remove links appear when there is more than one tweet.
- Character counts use the official `twitter-text` parser: standard 280 weighted characters, URLs counted as 23, and weighted emoji/CJK.
- Over-limit or disallowed text is marked invalid with an inline error. Unfinished drafts remain editable and exportable; nothing is posted to X.
- Import/export JSON using the links at the top. Imports validate the file before replacing work and ask before replacing a nonempty draft.
- Drafts autosave in local browser storage. Export backups: clearing browser data removes saved work, and private browsing/file URLs may restrict storage.

The interface intentionally has no profile settings, numbering toggle, title editor, marketing panels, or simulated social actions. Existing files retain their profile, title, and numbering settings for compatibility.

## Link previews

The preview renders an image-first card for the first URL in each tweet: a rounded image, a one-line title overlaid along the bottom, and “From domain” underneath. Descriptions are omitted. A trailing URL is hidden in the preview once its image loads, but remains in the editor, character count, and JSON. Missing or blocked images fall back to a plain title card. Links to the `twedit.net` home page use this app's metadata and bundled social image, including when used offline.

For other sites, click **Load link preview** on the card. This contacts only that URL directly, without cookies or a referrer; nothing is sent to a proxy. Metadata requests require HTTPS, reject literal IPs and obvious local hostnames, and are limited to 6 seconds and 512 KB. Open Graph tags are preferred, with Twitter Card and HTML title fallbacks. Remote HTML stays inert and metadata is rendered as plain text.

Many websites block cross-origin browser requests (CORS), redirect, or restrict image access. Those links keep a plain domain card with an unavailable message; Twedit does not claim to reproduce X's server-side unfurling for every site. Remote images also require CORS. Requested results are cached only in memory and are not included in exported drafts. Your draft text stays local; explicitly loading a card reveals the linked URL and your IP to that site (and its image host, when applicable).

The site's own Open Graph and Twitter Card tags point to `social-preview.png`. To reproduce the 1200 × 630 share image with the actual editor:

```sh
npm run build
npm run preview:render
```

The screenshot renderer uses Playwright's Chromium (or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`) and does not publish anything.

## JSON format

```json
{
  "version": 1,
  "title": "Untitled thread",
  "profile": { "name": "Your name", "handle": "yourhandle" },
  "numbering": false,
  "tweets": ["First thought.", "Another thought."]
}
```

Drafts support up to 100 tweets, 10,000 raw UTF-16 code units per editor, and imports up to 8 MB. These are resource limits, not Twitter's posting limits.

## Development

Node.js 20+, npm, and Python 3:

```sh
npm ci
npm run build       # Bundle JS and compile Flowbite/Tailwind CSS
npm test            # Character counting and JSON validation
npx playwright install chromium
npm run test:e2e    # Browser tests; starts its own local server
```

For system Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. Minimal Linux environments need a working Fontconfig configuration.

Deploy `index.html`, `style.css`, `app.js`, `app.js.LEGAL.txt`, `social-preview.png`, and `licenses/` together to any static host. Dependency notices are in `licenses/`.
