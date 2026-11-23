/* Shared educational projection. Measurements and foot anchors remain unchanged. */
window.SwingPoseProject=(()=>{
 const midpoint=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2,Math.min(a[2],b[2])];
  function project(points, baseline, value, {channels,channel,width,height}) {
    const pose = points.map(point => point.slice());
    const delta = channel => {
      const difference = value(channel) - baseline[channels.indexOf(channel)];
      return Math.max(-Math.PI / 3, Math.min(Math.PI / 3, difference));
    };
    const pelvis = midpoint(pose[12], pose[13]);
    const shoulders = midpoint(pose[0], pose[1]);
    function rotate(indices, pivot, angle) {
      if (!angle) return;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (const index of indices) {
        const point = pose[index];
        const x = point[0] - pivot[0], y = point[1] - pivot[1];
        point[0] = pivot[0] + x * cos - y * sin;
        point[1] = pivot[1] + x * sin + y * cos;
      }
    }
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    // Limit the displacement of the two torso attachments to 40% of their measured lengths.
    function turnTorso(indices, pivot, angle, attachments) {
      const bound = Math.min(...attachments.map(([moving, fixed]) =>
        2 * Math.asin(Math.min(1, 0.20 * distance(pose[moving], pose[fixed]) /
          Math.max(1e-9, distance(pose[moving], pivot))))));
      rotate(indices, pivot, Math.sign(angle) * Math.min(Math.abs(angle), bound));
    }
    const upper = [0,1,2,3,4,5,6,7,8,9,10,11];
    turnTorso(upper, shoulders, delta("torso") + (channel === "x_factor" ? delta("x_factor") : 0), [[0,12],[1,13]]);
    turnTorso(upper, pelvis, delta("lean"), [[0,12],[1,13]]);
    // Keep each ankle and shoe at its measured position. Resolve knees against those fixed endpoints.
    if (delta("hips")) {
      const solve = fraction => {
        [pose[12], pose[13]] = [points[12].slice(), points[13].slice()];
        turnTorso([12,13], pelvis, delta("hips") * fraction, [[12,0],[13,1]]);
        return [0, 1].map(side => {
          const [hip, knee, ankle] = [12,14,16].map(i => points[i + side]);
          const moved = pose[12 + side];
          const a = distance(hip, knee), b = distance(knee, ankle), d = distance(moved, ankle);
          if (d < 1e-6 || d > a + b || d < Math.abs(a - b)) return null;
          const x = (ankle[0] - moved[0]) / d, y = (ankle[1] - moved[1]) / d;
          const along = (a * a - b * b + d * d) / (2 * d);
          const turn = Math.sign((ankle[0] - hip[0]) * (knee[1] - hip[1]) - (ankle[1] - hip[1]) * (knee[0] - hip[0])) || 1;
          const off = turn * Math.sqrt(Math.max(0, a * a - along * along));
          return [moved[0] + x * along - y * off, moved[1] + y * along + x * off, knee[2]];
        });
      };
      let knees = solve(1);
      if (!knees.every(Boolean)) {
        let low = 0, high = 1;
        for (let i = 0; i < 18; i++) {
          const mid = (low + high) / 2;
          if (solve(mid).every(Boolean)) low = mid;
          else high = mid;
        }
        knees = solve(low);
      }
      if (knees.every(Boolean)) [pose[14], pose[15]] = knees;
      else [pose[12], pose[13]] = [points[12].slice(), points[13].slice()];
    }
    rotate([2,4,6,8,10], pose[0], delta("swing"));
    rotate([3,5,7,9,11], pose[1], delta("swing"));
    rotate([4,6,8,10], pose[2], delta("wrist"));
    rotate([5,7,9,11], pose[3], delta("wrist"));
    // A single 2D view cannot alter knee flex or heel lift with fixed contact and limb lengths.
    // paintCue shows the difference without moving those anchors.
    pose.push(midpoint(pose[0], pose[1]), pelvis,
      [pelvis[0] + delta("shiftX") * width, pelvis[1] - height * 0.12, pelvis[2]],
      [pelvis[0] + delta("shiftX") * width, pelvis[1] + height * 0.12, pelvis[2]]);
    return pose;
  }


return {project};
})();
