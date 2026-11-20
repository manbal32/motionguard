# Hosted MotionGuard

This source builds the deployed mobile app from `swing3d/web`, adding the private Worker runtime. Existing tracking, local measurements, 3D, course animation and report remain available.

Build from this directory:

```
python scripts/build_server.py
node --test tests/*.test.mjs
```

`MOTIONGUARD_SOURCE` optionally selects the source swing3d directory. `MOTIONGUARD_COURSE_IMAGES` optionally selects separately held research course images. They are excluded from Git. Without those images, legacy Valley playback reports its missing imagery; OSM source loading is separate. The production Site retains the previously approved tour; a fresh checkout supplies a link back to the app instead.

Worker output: `dist/server/index.js`, `dist/server/wrangler.json`, assets `dist/client`. Keep the existing `.openai/hosting.json` project identity. Configure GEMINI_API_KEY in Sites runtime secrets, never in browser JavaScript or Git. GEMINI_MODEL currently uses gemini-flash-lite-latest. Publish with the existing Sites source repository/owner-private access workflow; the GitHub repository is not automatically deployed to Sites.

## Current behavior

- Text dialogue and consenting text-summary generation use Gemini. Summary remains editable and requires approval.
- Analysis extracts exactly five original JPEG stills locally. Separate image consent is required. Approved summary + five images go to Gemini; video and raw coordinates do not.
- Validated, image-anchored feedback is saved with real API token usage/model/time. Errors never become successful fallback AI diagnoses. HTTP 502/503 gets at most one retry; failed-attempt usage is unknown.
- Inadequate image/phase evidence is separate from improvement candidates. Monocular inferred kinetics (weight, ball flight, distance, score, pain) must not be promoted to confirmed findings. AI feedback remains observational, not a validated diagnosis.
- Original video and static 2D have separate tabs. Only original video loops. 2D remains at the selected issue frame; no moving 2D or restored original screenshot beside it. Report/PDF uses the same saved AI response and token totals.
- Public course search is backed by 1,056 named OSM entries retrieved on 2026-11-20. Selecting a course fetches its actual public map geometry, with two attributed source snapshots as outage fallbacks.
- Automatic numbered-hole playback requires registered hole centerlines. Unknown par/tee/course grouping remains unknown. Fairway polygons are not invented into numbered holes. In the inspected Rivera and Korea CC data, there were **zero registered hole centerlines**: an actual overview and unavailable status are shown; existing Valley 9-hole playback remains available.
- Naver screenshot scraping/automatic hole recognition, Gold CC coverage, official tee lengths, difficulty and average-score ingestion are **not implemented/verified**. Not all golf courses or holes can be loaded.
- Simulation now uses explicit adjustable club-distance/spread assumptions instead of silently treating posture scores as real ball carry/dispersion. It retains connected shots, curved flight, small golfer, seeded replay, per-hole sums and PDF. No OB/water penalties or forced 90–92 target.

See ../PHOTO_COACH_RESULTS.md for measured checks and remaining limitations.

## Feedback-specific YouTube recommendations

`server/videos.mjs` retrieves public search metadata for the actual improvement title/drill. At most two source-backed watch links per eligible item are persisted with the report. Positive, unassessable and low-confidence findings are excluded. On live-search failure or no relevant metadata, an attributed nine-video index is searched by topic. This limited index is not unlimited fresh discovery. Whole-video review is explicitly false. Existing reports can refresh/save recommendations. See ../YOUTUBE_RECOMMENDATION_RESULTS.md for network limits and 25 passing tests.
