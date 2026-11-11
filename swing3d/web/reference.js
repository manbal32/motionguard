(() => {
  const model = {
    // Address, top, delivery, impact, finish. Angles are authored in degrees.
    swing: [0, 120, 40, 0, -135],
    torso: [0, 44, 18, -28, -65],
    hips: [0, 24, -8, -22, -55],
    lean: [15, 15, 19, 15, 5],
    wrist: [0, 35, 20, 0, 5],
    shiftX: [0, 0.055, 0.025, -0.055, -0.10],
    kneeL: [14, 21, 21, 10, 5],
    kneeR: [14, 12, 19, 19, 9],
    heelR: [0, 0, 0.12, 0.35, 0.85],
  };

  const channels = Object.freeze(Object.keys(model));
  const phases = ["address", "top", "down", "impact", "finish"];

  function expand(track) {
    const { meta, events } = track;
    const last = track.track.length - 1;
    const start = meta.source_frames?.[0] ?? 0;
    const indices = phases.map(phase => Math.max(0, Math.min(last,
      meta.phase_frames ? meta.phase_frames[phase] - start
        : Math.round(last * (events[phase] * meta.dur - meta.hold) / (meta.dur - meta.hold)))));
    const address = channels.map(channel => track.track[indices[0]][track.channels.indexOf(channel)]);
    const keys = channels.map((channel, i) => model[channel].map(value =>
      address[i] + (value - model[channel][0]) * (["shiftX", "heelR"].includes(channel) ? 1 : Math.PI / 180)));
    return track.track.map((_, index) => {
      if (index <= indices[0]) return address.slice();
      const upper = indices.findIndex(value => value > index);
      if (upper < 0) return keys.map(values => values[4]);
      const t = (index - indices[upper - 1]) / (indices[upper] - indices[upper - 1]);
      const blend = t * t * (3 - 2 * t);
      return keys.map(values => values[upper - 1] + (values[upper] - values[upper - 1]) * blend);
    });
  }

  window.SwingReference = Object.freeze({ ...model, channels, expand });
})();
