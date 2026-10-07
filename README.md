# CyberNotes

A lightweight, GitHub Pages–hosted cybersecurity knowledge base. Every note is a
Markdown file in `notes/`; a zero-dependency Node script turns the folder into a
searchable, tag-filtered, dark/light static site. Adding a note is a `git push`
and nothing else — no HTML editing, no backend, no build service.

- **Search** — client-side full-text + tag search over a static JSON index
- **Tags** — `#nmap`, `#linux`, `#web-security` … clickable everywhere, each with
  its own generated page (`/tags/nmap/`) and a note count
- **Cards and reading view** — grid of notes with sorting/filtering, then a clean
  article layout with table of contents, syntax-highlighted code, copy buttons,
  image lightbox, related notes and previous/next navigation
- **Themes** — follows the OS by default, manual dark/light toggle that persists
- **No runtime dependencies** — no npm packages, no CDN, no external image host

---

## 1. Quick start

```console
$ git clone https://github.com/<you>/CyberNotes.git
$ cd CyberNotes
$ npm run dev
```

Then open <http://localhost:4173>. There is nothing to install: the builder uses
only the Node standard library (Node 18 or newer).

| Command | What it does |
| --- | --- |
| `npm run build` | Generates the whole site into `dist/` |
| `npm run dev` | Builds, then serves `dist/` at `http://localhost:4173` with clean URLs |
| `npm run check` | Builds, then verifies every internal link, image and asset resolves |
| `npm run clean` | Deletes `dist/` |

Build output goes to `dist/`, which is git-ignored. The repository itself is just
Markdown, assets and the small builder.

---

## 2. Creating a new note

Create a file in `notes/`, add front matter, write the body.

```console
$ cp notes/_TEMPLATE.md notes/burp-intercepting-requests.md
$ $EDITOR notes/burp-intercepting-requests.md
```

```markdown
---
title: "Intercepting Requests with Burp Suite"
date: "2026-10-07"
updated: "2026-10-09"          # optional
tags: [burp-suite, web-security, http, proxy]
difficulty: intermediate       # beginner | intermediate | advanced
summary: "Setting up the proxy, trusting the CA certificate, and reading a request in the Repeater."
featured: false                # optional — pins it to the homepage
---

## Why a proxy in the middle
…
```

The file name becomes the URL: `notes/burp-intercepting-requests.md` →
`/notes/burp-intercepting-requests/`. Need a different URL? Add `slug: my-url`.

| Front matter key | Required | Notes |
| --- | --- | --- |
| `title` | recommended | Falls back to a title-cased version of the file name |
| `date` | recommended | `YYYY-MM-DD`; drives ordering, the card date and the feed |
| `updated` | no | Shown as a second date on the note page |
| `tags` | no | YAML list or inline `[a, b]`; each tag gets a page automatically |
| `difficulty` | no | `beginner` / `intermediate` / `advanced` (`easy`, `medium`, `hard` also work) |
| `summary` | no | Falls back to the first paragraph, trimmed to ~180 characters |
| `featured` | no | `true` puts the note in the homepage "Featured" row |
| `draft` | no | `true` excludes the note from the build entirely |

**Publishing:**

```console
$ git add notes/burp-intercepting-requests.md
$ git commit -m "Add Burp Suite interception notes"
$ git push
```

GitHub Actions rebuilds and redeploys automatically.

### Supported Markdown

Headings (with anchors and an auto-generated table of contents), bold/italic/
strikethrough/highlight, inline code, fenced code with language highlighting,
tables with alignment, ordered/unordered/task lists and nesting, blockquotes,
callouts, images and video, `<details>` blocks, footnotes-free reference links,
autolinks, and a small sanitised HTML allowlist (`kbd`, `mark`, `sub`, `sup`).

Callouts use GitHub-style syntax and map onto the site's colours:

```markdown
> [!NOTE]     > [!TIP]      > [!WARNING]   > [!CAUTION]
> [!IMPORTANT] > [!LAB]     > [!OPSEC]
```

`[!LAB]` and `[!OPSEC]` are additions for lab-target reminders and
authorization/scope notes.

---

## 3. Tags

Tags are plain words in the front matter — there is no registry to maintain.

```yaml
tags:
  - nmap
  - recon
  - networking
```

Anything you write becomes a tag page at `/tags/<slug>/` with a note count, and
appears in the homepage tag cloud and the `/tags/` directory. Tag names with
spaces become dashes in the URL (`web security` → `/tags/web-security/`).

You can also write `#nmap` inline in a note body and it becomes a clickable link
to that tag. Nothing needs registering: use a new word and the tag exists.

---

## 4. Images, screenshots and downloads

Put files in `images/` and reference them relative to the note (notes live one
level down, hence `../`):

```markdown
![Nmap showing 22, 80 and 445 open](../images/nmap-syn-scan.png)
```

A paragraph containing only an image renders as a captioned `<figure>` that opens
in a lightbox; images inside a sentence stay inline. PNG, JPG, GIF, WebP and SVG
work, and MP4/WebM clips render as `<video>`. For downloads (PCAP, PDF, scripts),
link the file directly — anything you drop in `files/`, `images/` or next to a
note keeps its repository path in the built site.

See `images/README.md` for naming and redaction conventions.

---

## 5. Previewing locally

```console
$ npm run dev
```

`tools/serve.mjs` is a small static server that mimics GitHub Pages: it serves
`dist/`, resolves `/notes/foo/` to `/notes/foo/index.html`, and returns the
generated `404.html` for anything missing. It watches nothing, so re-run the
command (or `npm run build`) after editing a note.

By default a local build serves from the site root (`/`), so `npm run dev` gives
you a working site immediately — even if `url` in `site.config.json` points at
`https://user.github.io/CyberNotes`. To preview the deployed project-site layout
with its `/CyberNotes/` prefix, build *and* serve with the same base path:

```console
# PowerShell
$ $env:BASE_PATH = '/CyberNotes'; npm run build
$ node tools/serve.mjs

# bash
$ BASE_PATH=/CyberNotes npm run build
$ BASE_PATH=/CyberNotes node tools/serve.mjs
```

Either way, `node tools/check.mjs` reads the resolved path out of
`dist/build-meta.json`, so it always validates what was actually built.

---

## 6. How deployment works

`.github/workflows/deploy.yml` runs on every push to `main`:

1. Checks out the repository and installs Node 20 (no `npm install` — there are
   no dependencies).
2. Runs `node tools/build.mjs`, which regenerates `dist/` from `notes/`,
   `images/`, `template/` and `public/`.
3. Runs `node tools/check.mjs`, which fails the build if any internal link or
   asset reference is broken.
4. Uploads `dist/` as a Pages artifact and deploys it.

The builder detects the deployment sub-path on its own:

| Situation | Detected base path |
| --- | --- |
| running in Actions for `repo` (project site) | `/repo`, taken from `GITHUB_REPOSITORY` |
| `repo` ends in `.github.io`, or you set `basePath` | your value (use `""` for a custom domain) |
| local `npm run build` / `npm run dev` | `/` |

Canonical URLs, the RSS feed, the sitemap and `robots.txt` are built from the
*origin* of `url` in `site.config.json` (or `SITE_URL`) plus that base path, so
they never accumulate the repository name twice. Override either value when you
need to:

```console
$ BASE_PATH='' SITE_URL='https://notes.example.com' node tools/build.mjs
```

---

## 7. Enabling GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to `main` (or run the workflow manually from the **Actions** tab).
5. Wait for the "deploy" job and open the URL it prints.

If the first run fails with a permissions error, check **Settings → Actions →
General → Workflow permissions** allows the workflow to read and write. The
`pages` and `id-token` write permissions it needs are already declared in
`.github/workflows/deploy.yml`.

Custom domain: add a `CNAME` file to `public/` (it is copied to the site root
verbatim), point the DNS record at GitHub, and set `BASE_PATH=''` in the build
step so links stay at the domain root.

---

## 8. Customising the site

Everything user-visible lives in `site.config.json`:

```json
{
  "title": "CyberNotes",
  "tagline": "Field notes from authorized security practice",
  "description": "…used for meta tags, the feed and the about page…",
  "author": "Your Name",
  "url": "https://your-username.github.io/CyberNotes",
  "basePath": "",
  "repo": "https://github.com/your-username/CyberNotes",
  "nav": [{ "label": "Notes", "href": "/notes/" }],
  "social": [{ "label": "GitHub", "href": "https://github.com/…" }],
  "homeIntro": "…the homepage lede…",
  "authorizationNote": "…shown in the about page callout…"
}
```

`repo` powers the "Source" and "Edit this note" links on every note page — point
it at your fork and those links work immediately.

**Colours and typography** are CSS custom properties at the top of
`template/style.css`. Both themes are defined once (`:root` for dark,
`:root[data-theme="light"]` plus a `prefers-color-scheme` block for light), so
changing `--accent`, `--surface` or `--font-mono` re-skins the whole site:

```css
:root {
  --accent: #34d3b4;      /* links, active states, tag chips */
  --font-mono: "JetBrains Mono", Consolas, monospace;
}
```

---

## 9. Repository layout

```text
CyberNotes/
├── notes/                    # ← the only folder you normally touch
│   ├── _TEMPLATE.md          # copy this to start a note (files starting with _ are ignored)
│   ├── nmap-syn-scanning.md
│   ├── gobuster-directory-enumeration.md
│   ├── linux-file-permissions.md
│   └── sql-injection.md
├── images/                   # screenshots and diagrams, committed to the repo
├── files/                    # optional: downloadable attachments (PCAP, PDF, scripts)
├── template/                 # style.css, app.js, search.js — copied to /assets/
├── public/                   # copied verbatim to the site root (favicon.svg, and a CNAME if you add one)
├── tools/
│   ├── build.mjs             # entry point
│   ├── check.mjs             # post-build link/asset verification
│   ├── serve.mjs             # local preview server
│   ├── clean.mjs
│   └── lib/                  # frontmatter · markdown · highlight · notes · pages · templates · utils
├── site.config.json          # site title, author, URLs, navigation
└── .github/workflows/deploy.yml
```

### How a note becomes a page

```text
notes/foo.md
   │  front matter parsed            tools/lib/frontmatter.mjs
   │  Markdown rendered              tools/lib/markdown.mjs
   │  code blocks highlighted        tools/lib/highlight.mjs
   │  tags indexed, related computed tools/lib/notes.mjs
   ▼
dist/notes/foo/index.html   +  /tags/<tag>/  +  search-index.json  +  feed.xml  +  sitemap.xml
```

Broken front matter never breaks a build silently: `npm run build` prints a
warning for a missing date, a missing front matter block or a duplicate slug, and
`npm run check` fails the run if a link points at a page that was not generated.

---

## 10. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Note missing from the site | `draft: true` in the front matter, or the file name starts with `_` / `.` |
| Wrong order on the notes page | Check the `date` field; notes without a parseable date sort last |
| Images do not appear | Path must be relative to the note: `../images/x.png`. Run `npm run check` |
| Styles missing on the deployed site | Base path mismatch. The workflow derives it from the repository name; for a custom domain set `"basePath": ""` in `site.config.json` |
| 404 on a tag page | The tag is spelled differently in the front matter than in the link (slugs are lowercased and hyphenated) |
| Build prints "no YAML front matter block found" | The file must start with a line containing exactly `---` |

---

## 11. Scope and intent

This site is for documenting **authorized** security learning: personal labs,
CTFs, TryHackMe, Hack The Box, WebGoat, DVWA, OWASP practice, systems you own,
and educational research. The sample notes are written against purpose-built
vulnerable targets. Edit `authorizationNote` in `site.config.json` so the about
page reflects your own scope, and keep it accurate — a knowledge base that
documents the authorization boundary is a better artefact than one that does not.

---

## Licence

The builder and templates are yours to modify. Sample note content is provided as
a starting point — replace it with your own work.
