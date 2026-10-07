---
title: "Note title in sentence case"
date: "2026-10-07"              # required for ordering; YYYY-MM-DD
updated: "2026-10-07"           # optional — shows a second date on the page
tags:                           # any words you like; new tags are created just by using them
  - example
  - template
difficulty: beginner            # beginner | intermediate | advanced
summary: "One or two sentences that appear on the card, in search results and in the RSS feed."
featured: false                 # true pins the note to the homepage
draft: false                    # true keeps the note out of the build entirely
---

Delete this template once you have your own notes. Everything below is optional
formatting that the builder understands.

## Section heading

Normal paragraphs. **Bold**, *italic*, ~~strikethrough~~, `inline code`,
[keyboard keys](https://example.com), and #hashtags that automatically become
links to the matching tag page.

> [!NOTE]
> Callouts: `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`,
> `[!LAB]` for lab-target reminders, and `[!OPSEC]` for authorization notes.

## Code blocks

Always tag the fence with a language — it enables syntax highlighting:

```bash
nmap -sV -sC -oA scans/services 10.10.10.24
```

```console
$ id
uid=1000(dev) gid=1000(dev)
```

## Images

Save files in `images/` and reference them relatively. A link to a screenshot in
the repository is written from the note's own folder:

```markdown
![Nmap scan output](../images/example-scan.svg)
```

A standalone image becomes a captioned figure that opens in a lightbox.

## Tables, lists and details

| Column | Meaning |
| --- | --- |
| first | what the column holds |
| second | numbers, states or verdicts |

- unordered lists
- nested lists work too
  - like this
- [x] task list items are supported
- [ ] both checked and unchecked

<details>
<summary>Collapsed section</summary>

Anything inside a `<details>` block is hidden until the reader opens it — handy
for long command output, alternative tooling, or spoiler-ish CTF steps.

</details>

## Reference links

Footnotes are not supported; use reference-style links instead:

```markdown
See the [OWASP cheat sheet][owasp].
[owasp]: https://cheatsheetseries.owasp.org/
```

## Before committing

1. `npm run build` — confirms the note parses and the front matter is valid.
2. `npm run dev` — check the page at <http://localhost:4173>.
3. `npm run check` — verifies every link and image reference resolves.
4. `git add notes/your-note.md && git commit -m "Add …" && git push`.
