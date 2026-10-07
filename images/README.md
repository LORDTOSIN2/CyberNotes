# images/

Every image referenced from a note lives here, committed to the repository —
no external image host, so the site keeps working offline and nothing breaks
when a third-party service changes its terms.

## How to reference a file

Notes live in `notes/`, images in `images/`, so the relative path from a note is
one level up:

```markdown
![Nmap scan output showing three open ports](../images/nmap-syn-scan.png)
```

Standalone image links (a paragraph that contains nothing but the image) are
rendered as a `<figure>` with the alt text as the caption, and clicking opens a
lightbox. Images inside a sentence stay inline.

## Supported formats

| Format | Use for |
| --- | --- |
| `png` | terminal output, diagrams, anything needing crisp text |
| `jpg` / `jpeg` | photographs, large screenshots |
| `gif` | short terminal recordings |
| `webp` | smaller versions of the above (good default for the web) |
| `svg` | hand-written diagrams — small, scales perfectly, diffable in Git |
| `mp4` / `webm` | video clips; reference them the same way and they render as `<video>` |

## Conventions that keep the repository readable

- Name files after the note they belong to: `nmap-syn-scan.png`, not `screenshot1.png`.
- Keep screenshots under ~300 KB. Crop to the relevant region and re-export rather
  than uploading a full-desktop capture.
- Keep diagrams as `.svg` when you can — they stay sharp and review well in a diff.
- Never commit a screenshot containing real credentials, session tokens, customer
  data, or an unmasked internal hostname. Blur or re-shoot.
- Redact the same way in every note: a consistent `REDACTED` marker is easier to
  audit later than a mix of blur, black boxes and crop.
- Prefer the directory layout `images/<topic>/…` once you have more than a few
  dozen files, and update the note links accordingly.

The example diagrams in this folder are hand-drawn SVGs so the repository has no
binary blobs to start with; replace them with your own screenshots as you go.
