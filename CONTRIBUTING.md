# Contributing / note conventions

Short version: create a Markdown file in `notes/`, add front matter, commit. This
file records the conventions that keep the site consistent as it grows.

## The checklist before every commit

```console
$ npm run build     # warnings point at malformed front matter
$ npm run check     # fails on broken links or missing images
$ npm run dev       # look at it at http://localhost:4173
```

## Front matter

```yaml
---
title: "Sentence-case title, no trailing period"
date: "2026-10-07"
updated: "2026-10-09"
tags: [nmap, recon, networking]
difficulty: beginner
summary: "One or two sentences: what this note covers and when you would reach for it."
featured: false
draft: false
---
```

Only `title` and `date` really matter; everything else has a fallback.

## Writing conventions

- **Summary first.** The summary appears on the card, in search and in the feed.
  Write it as a promise about what the reader will be able to do afterwards.
- **One topic per note.** If it needs two `##` sections that could stand alone,
  it is probably two notes — link them instead.
- **Commands must be reproducible.** Show the full command with flags, and say
  which output lines matter. A block of terminal output with no commentary is
  hard to use six months later.
- **Say which target.** Lab VM, CTF box, your own domain. Never paste output from
  a system you were not authorized to test, and never include real credentials,
  tokens, customer data or unmasked internal hostnames — write `REDACTED`.
- **Mark the boundary.** Use a `> [!WARNING]` callout for anything that could
  damage a target or break scope (aggressive scan rates, write-capable payloads,
  privilege escalation on a live host).
- **Add the defensive half.** A note that stops at "here is how to exploit it"
  is half a note. Add the detection and the fix.
- **Reference the source.** Link OWASP, RFCs, vendor docs, man pages. Claims
  without a reference become folklore.

## Tags

- Prefer a small, consistent vocabulary. Check `/tags/` before inventing a new
  one — `web-security` and `websecurity` should not both exist.
- Lowercase, hyphenated: `sql-injection`, `privilege-escalation`, `burp-suite`.
- 3–6 tags per note. The first three are the ones readers see on a card.
- Tags are created by using them — no registry, no config change.

## Headings and code

- Start body headings at `##`; `#` is reserved for the note title.
- Keep heading text short — it becomes the table of contents.
- Always tag a code fence with its language (`bash`, `console`, `python`, `json`,
  `yaml`, `sql`, `http`, `diff`, …). `console` is highlighted as a terminal
  session, with prompts and commands in different colours.
- Use `console` for command-plus-output and `bash` for copy-pasteable commands.

## Images

- Store in `images/`, reference relatively: `![…](../images/name.png)`.
- Descriptive alt text always — it is the caption and the accessible name.
- Crop to the relevant region; keep files under ~300 KB.
- Diagrams as `.svg` when possible: sharp, small, and reviewable in a diff.
- Redact before committing, and use the same `REDACTED` marker every time.

## Commit messages

`Add <topic> notes` / `Update <note>` / `Fix <thing>`. The history is the only
record of when a note changed, so keep it readable.

## What not to commit

- `dist/` (generated), `node_modules/`, editor and OS noise — all already ignored.
- Anything that only makes sense on your machine (absolute paths, personal IPs).
- Real target data. Ever.
