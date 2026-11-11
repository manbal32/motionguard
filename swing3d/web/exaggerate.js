/* global SwingReference */
window.SwingExaggeration = (() => {
  const levels = Object.freeze({ low: 1.5, medium: 2, high: 2.5 });
  const smooth = value => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };

  function apply(track, reference, finding, multiplier) {
    const measuredIndex = track.channels.indexOf(finding?.channel);
    const referenceIndex = SwingReference.channels.indexOf(finding?.channel);
    const factor = Math.max(1, Math.min(3, multiplier));
    if (factor === 1 || measuredIndex < 0 || referenceIndex < 0 || !finding?.range) return track.track;
    const [start, end] = finding.range;
    const ramp = (end - start) / 3;
    if (!(ramp > 0)) return track.track;
    const { dur, hold } = track.meta;
    return track.track.map((measured, index) => {
      const time = (hold + (dur - hold) * index / Math.max(1, track.track.length - 1)) / dur;
      if (time <= start || time >= end) return measured;
      const envelope = smooth((time - start) / ramp) * smooth((end - time) / ramp);
      const displayed = measured.slice();
      const actual = measured[measuredIndex];
      const extra = (actual - reference[index][referenceIndex]) * (factor - 1) * envelope;
      if (actual !== 0 && extra !== 0 && Math.sign(actual) !== Math.sign(extra)) {
        const minimum = ["shiftX", "heelR"].includes(finding.channel) ? 0.02 : 2 * Math.PI / 180;
        const scale = Math.max(Math.abs(actual), minimum);
        // Exponential decay starts continuously at 1× and approaches zero from the measured side.
        const magnitude = Math.abs(actual) * Math.exp(-Math.abs(extra) / scale);
        displayed[measuredIndex] = Math.sign(actual) * Math.max(Number.MIN_VALUE, magnitude);
      } else {
        displayed[measuredIndex] = actual + extra;
      }
      return displayed;
    });
  }
  return Object.freeze({ levels, apply });
})();
