# Gemini token economy results — 2026-11-21

User constraint: long questions are valid; Gemini reads the full allowed conversation and answers concisely. Never truncate user content to reduce tokens or invent a replacement diagnosis locally.

- Input limit: 6000 characters per user message (previously500); HTTP body limit256000, supporting Korean UTF-8 over full allowed history. Summary fields remain500 characters each.
- Reply instruction: usually1–3 Korean sentences,100–200 characters; preserve key requests, numbers, conditions; at most one necessary follow-up. Explicit requests for detail allow sufficient explanation. Returned text is not locally clipped.
- Photo prompt length:2394→1268 characters,47.0% fewer characters. This is not a billed-token or total-cost percentage.
- Gemini returns four scored dimensions once, retaining score/basis/strength/improvement/drill/sample_id/confidence. Prompt requests legacy items=[] to avoid duplication; old items remain supported.
- Overall score, consultation context, current/improved18-hole estimates, assumptions, withheld judgments, five JPEG inputs and receipt verification remain. No raw videos/coordinates added to external transmission.
- Repair retains the same five images and approved summary; no longer resends the full previous analysis text. Max output ceilings unchanged: chat500/summary1000/photo8000.
- Exact same successful analysis may be reused for10 minutes, last single result in current page memory only. Key includes build/revision, trackID, canonical four approved fields, five image hashes and sample metadata. Changes/expiry/force call Gemini. Same-signal concurrent requests join; failed/aborted calls never populate the cache. Consent required before reuse.
- Reuse shows0 tokens for current request and retains original usage/model/receipt, including in report metadata. Original report content is preserved.

Validation:

- Source and GitHub mirror: Node196/196, syntax and diff checks pass.
- Sites v70, source b09b6d43d109efdb6ad1afd5ed04849431b6343c; build d01b8e70095e45ab7163.
- Public HTTP audit:140/140 asset hashes match; deployed server build matches.
- Real Gemini chat smoke used only a synthetic650-character golf question: HTTP200,128-character answer, prompt535/output79/total614 tokens, model gemini-3.5-flash-lite. No private images were resent for this benchmark.
- No measured end-to-end cost reduction percentage, photo-diagnosis quality comparison, or actual mobile keyboard/touch verification. Longer first questions can increase input tokens. Short answers are model instructions, not a guaranteed hard character cap.

Existing upload/chat/approved-summary/photo-analysis/result/report/PDF/automatic-course-play/game/weather/club/returning-user flows remain covered by regression tests. Nationwide precise course predictions and cross-device/friend accounts are outside this change.
