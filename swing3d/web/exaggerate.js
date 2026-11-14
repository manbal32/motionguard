/* global SwingReference */
window.SwingExaggeration = (() => {
  const levels = Object.freeze({ low: 1.5, medium: 2, high: 2.5 });
  const limits = { torso: 18, hips: 15, lean: 15, swing: 25, wrist: 25, kneeL: 20, kneeR: 20 };
  const smooth = value => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };

  function resolve(track, finding) {
    const { meta } = track;
    const frame = (track.evidence?.phase_frames ?? meta.phase_frames)?.[finding.phase];
    if (!Number.isInteger(frame) || !Number.isInteger(finding.span_frames) || finding.span_frames < 1) return finding;
    const start = meta.source_frames?.[0] ?? 0;
    const time = offset => (meta.hold + (meta.dur - meta.hold) *
      (frame - start + offset) / Math.max(1, track.track.length - 1)) / meta.dur;
    // Keep the envelope centered even when the window extends beyond the sampled frames.
    return { ...finding, frame, range: [-finding.span_frames, finding.span_frames].map(time) };
  }

  function apply(track, reference, finding, multiplier) {
    const measuredIndex = track.channels.indexOf(finding?.channel);
    const referenceIndex = SwingReference.channels.indexOf(finding?.channel);
    const factor = Math.max(1, Math.min(3, multiplier));
    if (factor === 1 || measuredIndex < 0 || referenceIndex < 0 || !finding?.range) return track.track;
    const [start, end] = finding.range;
    const ramp = (end - start) / 3;
    if (!(ramp > 0)) return track.track;
    const normalized = finding.channel === "shiftX" || finding.channel === "heelR";
    const maximum = normalized ? (finding.channel === "shiftX" ? 0.04 : 0.25) : limits[finding.channel] * Math.PI / 180;
    const nearZero = normalized ? 0.02 : 2 * Math.PI / 180;
    const { dur, hold } = track.meta;
    return track.track.map((measured, index) => {
      const time = (hold + (dur - hold) * index / Math.max(1, track.track.length - 1)) / dur;
      if (time <= start || time >= end) return measured;
      const envelope = smooth((time - start) / ramp) * smooth((end - time) / ramp);
      const displayed = measured.slice();
      const actual = measured[measuredIndex];
      const extra = (actual - reference[index][referenceIndex]) * (factor - 1) * envelope;
      if (actual === 0) return measured;
      if (extra !== 0 && Math.sign(actual) !== Math.sign(extra)) {
        // Exponential decay starts continuously at 1× and approaches zero from the measured side.
        const magnitude = Math.abs(actual) * Math.exp(-Math.abs(extra) / Math.abs(actual));
        displayed[measuredIndex] = Math.sign(actual) * Math.max(Number.MIN_VALUE, magnitude);
      } else {
        // Bound the illustration's additional displacement, while preserving the measured pose at 1×.
        const limit = maximum * Math.min(1, Math.abs(actual) / nearZero);
        displayed[measuredIndex] = actual + Math.sign(extra) * limit * -Math.expm1(-Math.abs(extra) / limit);
      }
      return displayed;
    });
  }
  return Object.freeze({ levels, apply, resolve });
})();
