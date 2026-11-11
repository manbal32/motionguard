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
      displayed[measuredIndex] += (measured[measuredIndex] - reference[index][referenceIndex]) * (factor - 1) * envelope;
      return displayed;
    });
  }
  return Object.freeze({ levels, apply });
})();
