# Outdoor MOV: single swing and duplicate finishes — 2026-11-21

Outdoor recordings are a primary use case. The supplied13.368-second rotated H264 MOV contains an early practice finish, a long wait and a later swing. Baseline whole-frame diversity picked roughly0.73/4.70/11.45/12.24/13.03 seconds: camera/background changes allowed repeated finish poses. Different JPEG hashes were not sufficient evidence of different poses.

Implementation:

- New local still-body.js describes arms/wrists relative to torso center, axis and scale. Translation/zoom/background variation do not certify another body posture. Visibility/finite-value guards and common visible arm joints required.
- Infer from each exact candidate JPEG. When small, crop around the person locally and inspect again; maintain a per-clip person ROI with full-image recovery. The external JPEG remains unmodified.
- Find one low/high/low wrist sequence followed by a finish; densely resample that window. Select five chronological, pairwise different body states within preparation/top/descent/impact-area/finish windows. Labels remain phase_unverified; this is not exact impact detection.
- Shared MotionStills.gather feeds original-video and photo-only paths. Local body vectors/fingerprints are removed before outgoing samples. Only the same five JPEGs plus approved consultation are sent externally.
- Photo-only seeks wait for painting, record actual callback time and reject known stale frames. Paused seek callback wait reduced to300ms plus paint ticks. Existing strict2D display inference stays separate from selection confidence.
- If fewer than five body observations are available, the older image-comparison compatibility path remains. Occlusion, very small people, difficult backlight and multiple people are not universally validated.

Validation:

- Source and GitHub mirror207/207 Node tests. New cases: camera translation/zoom invariance; waiting/early practice/late repeated finish exclusion; different background pixels cannot override identical bodies; adaptive resampling; no outgoing body vectors; cancellation; low/nonfinite body observations; stale callback rejection.
- Actual JS gather/selection with local Python MediaPipe CPU using the same lite model weights and ffmpeg-decoded images selected55 observed candidates→five distinct MOV photos around9.7583/10.2057/10.5040/10.6529/10.9515s, inspected visually. Earlier indoor side MP4 also passed59 candidates→five varied photos. Python image inference is a diagnostic substitute, not proof of Safari/WASM equivalence.
- Actual Gemini request with new MOV five JPEGs: HTTP200;5 forwarded images;5 unique hashes; all receipts match; overall score/four dimensions/current+improved18-hole ranges received. Empty consultation fields avoided fabricated history. Private response/media/body observations remain local and are excluded from source/deployment.
- Deployment HTTP audit:141/141 asset hashes match and worker build matches.
- Sites v73/source25d8bce6548cd584861283e8bfbc5d1c43fd75e2/buildd965b6851d023a3b3f03. Existing consultation/approval/report/PDF/immediate-game/weather/club regressions pass.
- Actual iPhone/Safari upload, seek, touch and keyboard flows remain unverified because browser tools were unavailable. No universal outdoor capture or diagnostic-accuracy guarantee is established.
