# Caption capture paths — manual check (Task 9, step 5)

Fill in after loading `apps/extension/.output/chrome-mv3` unpacked in Chrome and opening each video.
Path = which source served the captions: `timedtext` (player request observed in the main world),
`dom` (transcript panel fallback) or `none`. Flicker = anything visibly flashing (transcript panel,
CC toggling on/off) while capture ran.

Date checked: ____  Chrome version: ____  Signed in to YouTube: yes / no

| # | Video type | URL | Path used | Flicker? | Notes (translation present? chapters? time taken?) |
|---|------------|-----|-----------|----------|-------|
| 1 | EN lecture, manual captions | | | | |
| 2 | EN podcast, auto-captions only | | | | |
| 3 | Hindi lecture | | | | translatedCues present? |
| 4 | Hinglish vlog | | | | track language picked? |
| 5 | Video with creator chapters | | | | player markers vs description |
| 6 | Video with no captions | | | | expect `none` / no-captions |
| 7 | 3 h stream (VOD) | | | | |
| 8 | Short-length video | | | | |
| 9 | Any captioned video, CC **on** before opening | | | | CC still on, same track afterwards? |
| 10 | Any captioned video, CC **off** before opening | | | | CC back off afterwards? |

## Summary

- Path carrying the load: ____
- DOM fallback needed for: ____
- Follow-ups: ____
