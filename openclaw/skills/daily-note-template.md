# Daily Note Template

ClaudeBot writes a daily operational note at EOD using `write_memory`.
Path: `notes/YYYY-MM-DD.md`

Use this structure — bullets only, no prose:

```
# YYYY-MM-DD

## Done
- [task or event completed today]

## Decisions
- [any decision made, with brief reasoning]

## Issues
- [anything that broke, blocked, or needs follow-up]

## Next
- [top 1-3 things for tomorrow]

## Watch
- [risks or patterns worth monitoring]
```

Rules:
- Write only what's worth knowing tomorrow
- Skip sections that have nothing notable
- Never duplicate what's already in MEMORY.md
- Max ~10 bullets total — if it's longer, it's not distilled enough
