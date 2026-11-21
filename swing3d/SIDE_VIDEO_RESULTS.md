# Small golfer in side-view video — 2026-11-21

Actual failure reproduced with the uploaded H264720×1280,4.022-second/269-frame video. The file decodes normally. Whole-frame32×48 pose-diversity comparison rejected the five-still selection because the golfer occupies a small portion of a static wide-angle background. This is not evidence that side videos are generally unsupported.

Fix:

- Candidate scan17→33 over the full clip; pose hints and available person ROI retained.
- Try existing whole-frame comparison first. On failure, compare within a persistent temporal-change region. Suppress one-frame outliers via the second-highest/second-lowest brightness range. Require range24, at least24 active pixels and less than75% of the probe area. Pairwise changes must affect at least8 pixels by more than12 brightness units.
- Preserve time order, early preparation and late finish coverage, pairwise distinctness and phase_unverified. Do not claim exact phase detection or diagnose from the selection metric.
- The same selector supports locally tracked and photo-only fallback paths. External transmission remains five full original-derived JPEGs plus approved summary; no raw video or coordinates added.
- Selection audit records full-frame versus motion-region comparison and area ratio. Existing Gemini scoring, required four dimensions, report/PDF and immediate game access remain unchanged.

Verification:

- Source and GitHub mirror:200/200 Node tests, syntax/diff checks pass. Synthetic tests cover a small actor occupying under3.5% of a large probe, five unique states, repeated-pose/JPEG-noise rejection, isolated-pixel-noise rejection and dense time sampling.
- Uploaded video decoded with ffmpeg using the actual JS time planner, fingerprint calculation and selector. Previously failed; now five distinct images selected and visually reviewed. Selected times approximately0.46/1.77/2.37/2.61/3.32 seconds. This demonstrates image selection, not exact golf-phase labels.
- Actual production Gemini request with those five JPEGs returned HTTP200, five forwarded images, all five SHA256 receipts matched, an overall score/four dimension assessments/current and improved18-hole ranges. The four consultation fields were empty, avoiding invented user history. No raw video was transmitted. Real response and private media remain local and are not part of this repository or deployment.
- Public asset audit:140/140 SHA256 matches and deployed server build matches.
- Sites v72/source75d485b11dbb3e1c5b46bf35c01a395ee7403592/build950ccad5c66cd419dde6.
- Real browser/mobile upload/seek/touch testing was unavailable. ffmpeg reproduction and mocked DOM tests do not establish Safari frame-decoding compatibility. The model response is not proof of diagnosis accuracy or actual score prediction.
