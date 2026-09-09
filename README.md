# Twedit

A minimal, static Twitter/X thread editor: input on the left, live preview on the right, and an **Add tweet** button. Styled with [Flowbite](https://flowbite.com/docs/getting-started/quickstart/) and Tailwind CSS, compiled locally. No backend, account, analytics, or CDN requests.

## Use

Open `index.html` directly, or run `npm start` (Python 3 required) and visit http://localhost:3000. Built assets are included; installing dependencies is not necessary to use the page.

- Add tweets with the button or Ctrl/Cmd + Enter. Remove links appear when there is more than one tweet.
- Character counts use the official `twitter-text` parser: standard 280 weighted characters, URLs counted as 23, and weighted emoji/CJK.
- Over-limit or disallowed text is marked invalid with an inline error. Unfinished drafts remain editable and exportable; nothing is posted to X.
- Import/export JSON using the links at the top. Imports validate the file before replacing work and ask before replacing a nonempty draft.
- Drafts autosave in local browser storage. Export backups: clearing browser data removes saved work, and private browsing/file URLs may restrict storage.

The interface intentionally has no profile settings, numbering toggle, title editor, marketing panels, or simulated social actions. Existing files retain their profile, title, and numbering settings for compatibility.

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

Deploy `index.html`, `style.css`, `app.js`, `app.js.LEGAL.txt`, and `licenses/` together to any static host. Dependency notices are in `licenses/`.
