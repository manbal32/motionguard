# Multi-view swing extraction — 2026-11-22 (Asia/Seoul)

Latest request: broaden extraction across golf filming angles. This changes local frame selection, not the number of images sent to Gemini, conversation input or report/game behavior.

Implementation:

- Selection-only inference tolerates a visible shoulder/hip and one observed forearm; strict2D display confidence requirements remain unchanged. Missing joints stay missing.
- Retain torso-centered comparison for adequately visible bilateral cores; use observed same-side shoulder/hip arm features for partial occlusion. When the visible arm changes, compare wrist centers only through shared observed torso references, with an uncertainty margin. Without a shared reference, do not certify a different pose.
- Combine wrist-height, arm-fold/extension and observed body-path sequences. Projected shoulder spread and return consistency help choose a coherent sequence for the same preparation. These are view-adaptive signals, not a camera-angle classifier or3D reconstruction.
- Use a rectangular full-person crop and keep the accumulated clip envelope. No new narrowed crop when feet are unobserved. This avoids amplifying torso-only pose hallucination when one leg is occluded. Prefer stable preparation frames and resample the active motion more densely.
- Identical JPEGs still have zero distance. Close preparation/impact and adjacent fast-transition projections have distinct context-specific separation thresholds; repeated static finishes cannot establish a swing cycle. Phase names remain unverified candidates, not precise impact detection.
- At most33 coarse+49 refined local candidates. Outgoing samples remove body vectors/fingerprints; exactly five full original-derived JPEGs plus approved summary still leave the client. No extra LLM selection request or server-model change.

Verification:

- Source and GitHub mirror233/233 Node tests, syntax/diff checks pass. Includes nine projected yaw directions with/without mirroring(18 geometry combinations), low/high-angle projection, single visible arm, visibility switching, repeated-pose rejection, portrait/landscape padding, crop-foot guards/envelope and existing complete service regressions. Projected-coordinate tests do not establish RGB pose-detection accuracy at those real angles.
- Actual decoding with local native CPU MediaPipe using the bundled lite weights and the JS gather/selector: four user videos, one public oblique example and its horizontal-mirror control each produce five distinct photos, visually reviewed. Native Python inference/ffmpeg is a diagnostic substitute, not Safari/WASM equivalence.
- Public example source: https://github.com/wmcnally/golfdb/blob/master/test_video.mp4 . Downloaded for local diagnostics only; not copied to source or deployment. The mirror is an augmented control, not another real left-handed filming session.

|Case|Recording|Selected seconds|
|---|---|---|
|front|User indoor front|1.4152, 1.9593, 2.3171, 2.4364, 3.5663|
|side|User indoor side|1.5334, 1.8331, 2.2133, 2.4245, 3.2051|
|golf1|User indoor lower front|1.2912, 1.9519, 2.1249, 2.2440, 2.8394|
|outdoor|User outdoor rotated MOV|9.8494, 10.2144, 10.4983, 10.6529, 12.2404|
|public|Public oblique example|1.7893, 3.7178, 4.4044, 4.6659, 5.9735|
|mirror|Mirror control of public example|2.5738, 3.8814, 4.4044, 4.7391, 5.9735|

Deployment HTTP audit:141/141 public asset hashes match the local manifest and worker build matches.

Sites v74: source295a4e62e0811012b5e858e1c3dab6d134057059; buildfd5363904bd71c6a6b66. Private review photos and actual body observations remain outside the repository/site.

Limits: pure rear-view recordings across all angles, severe occlusion, multiple people, every light/codec/device condition and actual mobile upload/seek/touch have not been exhaustively verified. The image-only compatibility path remains when fewer than five body observations are available; it is not a universal outdoor guarantee. Existing30-second/150MB limits remain. Existing Gemini scores are reference estimates, not measured shot or diagnosis accuracy. No new Gemini quality claim is made by this local extraction change.
