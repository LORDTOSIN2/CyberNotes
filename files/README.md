# files/

Optional downloadable attachments referenced from notes: packet captures,
PDFs, configuration samples, small scripts, checklists.

Anything placed here keeps its repository path in the built site, so a note links
to it with an ordinary relative link — no special handling:

```markdown
Download the [capture of the handshake](../files/nmap-syn-scan.pcap).
[Checklist PDF](../files/lab-build-checklist.pdf) · [Nmap wrapper script](../files/scan.sh)
```

Same rules as `images/`: commit the file, keep it small, and never commit
real credentials, tokens, customer data or unredacted captures from a system you
were not authorized to test.

Screenshots belong in `images/`; this folder is for things a reader would
download rather than look at inline.
