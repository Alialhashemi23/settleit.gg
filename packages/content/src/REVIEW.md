# Question library review (2026-09-30)

Source: `frontend/src/lib/presets.ts` (210 prompts, ids q001–q210). Stable ids are preserved.
Generated into `catalog.ts` by `scripts/import-presets.py`; decisions live in that script.

| Decision | Ids | Reason |
| --- | --- | --- |
| Excluded | q123 | "Worst CEO" names real people negatively (personal callout, politically loaded) |
| Excluded | q129 | Twitter/X opinion is platform politics |
| Excluded | q135 | Podcast list is politically loaded |
| Retired | q187 | Duplicate of q075 (wedding song) |
| Retired | q147 | Overlaps q144 (childhood show) |
| Spoiler | q029, q033, q036, q037, q059, q199 | Options or prompt reveal plot events |
| Version 2 | q199 | Prompt said "movie" but options were TV series |
| Version 2 | q200 | "Spider-Verse vibes" was not a show |
| Version 2 | q082 | Dropped the "sociopath" jab from an option |

Result: 205 approved prompts, well above the 60 needed for a daily buffer. Tags are the
original ones; `topic` is the first topic tag. Approved prompts were checked against a
banned-word list in `test/catalog.test.ts` and read by hand for politics, religion,
sexual content and personal callouts.
