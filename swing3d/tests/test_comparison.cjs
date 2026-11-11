const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ window: {} });
for (const file of ["reference.js", "exaggerate.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../web", file), "utf8"), context);
}
vm.runInContext("globalThis.SwingReference = window.SwingReference", context);
const { SwingReference: reference, SwingExaggeration: exaggeration } = context.window;
const channels = [...reference.channels, "confidence"];
const track = {
  channels, meta: { source_frames:[100,110], phase_frames:{address:100,top:103,down:106,impact:108,finish:110}, dur:1, hold:0 },
  track: Array.from({length:11}, (_,i)=>channels.map((_,j)=>0.05*j+i/10)),
};
const model = reference.expand(track);

test("deficits approach zero continuously without reversing either direction", () => {
  const radians = Math.PI / 180;
  for (const sign of [-1, 1]) {
    const measured = {channels: ["torso"], meta: {dur: 1, hold: 0}, track: [[0], [sign * 14.2 * radians], [0]]};
    const baseline = measured.track.map(() => reference.channels.map(() => sign * 44 * radians));
    const at = factor => exaggeration.apply(measured, baseline, {channel: "torso", range: [0, 1]}, factor)[1][0];
    assert.equal(Math.abs(at(2) / radians).toFixed(1), "1.7");
    for (let step = 101; step <= 300; step++) {
      const value = at(step / 100);
      assert.equal(Math.sign(value), sign);
      assert.ok(Math.abs(value) < Math.abs(at((step - 1) / 100)));
    }
  }
});

test("address offsets and actual phase indices anchor all nine channels", () => {
  assert.equal(model.length, 11);
  assert.equal(model[0].length, 9);
  for (const [i,channel] of reference.channels.entries()) {
    assert.equal(model[0][i], track.track[0][i]);
    const unit = ["shiftX","heelR"].includes(channel) ? 1 : Math.PI/180;
    assert.ok(Math.abs(model[3][i] - model[0][i] - (reference[channel][1]-reference[channel][0])*unit)<1e-12);
  }
});

test("exaggeration is exact at 1×, eases at the range and alters only its channel", () => {
  const finding = {channel:"torso",range:[0.1,0.9]};
  const channel = channels.indexOf(finding.channel);
  assert.equal(exaggeration.apply(track, model, finding, 1), track.track);
  const shown = exaggeration.apply(track, model, finding, 20);
  assert.equal(shown[1], track.track[1]);
  assert.equal(shown[9], track.track[9]);
  const delta = track.track[5][channel]-model[5][channel];
  assert.ok(Math.abs(shown[5][channel]-(model[5][channel]+3*delta))<1e-12);
  assert.ok(Math.abs(shown[2][channel]-track.track[2][channel]) <
    2*Math.abs(track.track[2][channel]-model[2][channel]));
  for (const [i,row] of shown.entries()) {
    for (const [j,value] of row.entries()) if (j!==channel) assert.equal(value,track.track[i][j]);
  }
});
