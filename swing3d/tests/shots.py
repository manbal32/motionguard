"""Capture the live comparison. Run with python tests/shots.py (Playwright and Chrome required)."""

import json
from math import dist
import sys
import tempfile
import threading
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server import Handler, ThreadingHTTPServer


SIGN_CHECK = """track => {
    const reference = SwingReference.expand(track);
    let violations = 0, comparisons = 0;
    for (const channel of SwingReference.channels) {
      const index = track.channels.indexOf(channel);
      for (let step = 100; step <= 300; step++) {
        const result = SwingExaggeration.apply(track, reference, {channel, range: [0, 1]}, step / 100);
        result.forEach((row, frame) => {
          const actual = track.track[frame][index];
          if (Math.sign(actual) !== Math.sign(row[index])) violations++;
          if (step === 100 && result[frame].some((value, i) => value !== track.track[frame][i])) violations++;
          comparisons++;
        });
      }
    }
    return {violations, comparisons};
}"""

TRACE = """() => {
    const prototype = CanvasRenderingContext2D.prototype;
    const target = ctx => ['joints', 'exaggerated'].includes(ctx.canvas.id);
    const original = {};
    for (const key of ['clearRect', 'arc', 'moveTo', 'lineTo', 'stroke']) original[key] = prototype[key];
    window.poseTrace = {};
    prototype.clearRect = function (...args) {
      if (target(this)) poseTrace[this.canvas.id] = {points: [], links: [], guides: 0};
      return original.clearRect.apply(this, args);
    };
    prototype.arc = function (x, y, ...rest) {
      if (target(this)) poseTrace[this.canvas.id].points.push([x, y]);
      return original.arc.call(this, x, y, ...rest);
    };
    prototype.moveTo = function (x, y) {
      if (target(this)) this.traceStart = [x, y];
      return original.moveTo.call(this, x, y);
    };
    prototype.lineTo = function (x, y) {
      if (target(this)) this.traceEnd = [x, y];
      return original.lineTo.call(this, x, y);
    };
    prototype.stroke = function (...args) {
      if (target(this)) {
        const trace = poseTrace[this.canvas.id];
        if (this.getLineDash().length) trace.guides++;
        if (this.strokeStyle === '#e9e7e0') trace.links.push([this.traceStart, this.traceEnd]);
      }
      return original.stroke.apply(this, args);
    };
}"""


def capture(page, url, tracks):
    shots = ROOT / "mockups" / "shots"
    shots.mkdir(parents=True, exist_ok=True)
    page.add_init_script(f"({TRACE})();")
    page.goto(url)
    start = page.locator("#start")
    buttons = page.locator("#finding-options button")
    page.locator("#csv").set_input_files(ROOT / "samples/golf1_export.csv")
    with page.expect_response("**/api/track"):
        start.click()
    expect(buttons).to_have_count(1)
    expect(buttons.first).to_have_attribute("data-finding", "limited_torso_turn")
    csv_file, = tracks.glob("*.json")
    csv_signs = page.evaluate(SIGN_CHECK, json.loads(csv_file.read_text(encoding="utf-8")))
    assert csv_signs["violations"] == 0, csv_signs
    print("golf1 CSV sign check:", csv_signs)

    # The CSV has no original frames. Use the bundled video for the canvas shots.
    sample = json.loads((ROOT / "findings/sample.json").read_text(encoding="utf-8"))
    first = sample["findings"][0]
    sample["findings"].append(dict(first, id="shot_fixture_hips", channel="hips",
                                   label="검증용 · 골반 회전", severity="high"))
    page.route("**/api/findings/sample", lambda route: route.fulfill(json=sample))
    page.locator("#video").set_input_files(ROOT / "samples/golf_swing.mp4")
    with page.expect_response("**/api/video"):
        start.click()
    expect(buttons).to_have_count(2, timeout=30000)
    video_file, = set(tracks.glob("*.json")) - {csv_file}
    video_track = json.loads(video_file.read_text(encoding="utf-8"))
    video_signs = page.evaluate(SIGN_CHECK, video_track)
    assert video_signs["violations"] == 0, video_signs
    print("Video sign check:", video_signs)
    overlay = page.locator("#overlay")
    expect(page.locator("#toggle-joints")).to_have_attribute("aria-pressed", "true")
    expect(page.locator("#zoom-person")).to_have_attribute("aria-pressed", "true")
    page.evaluate("document.fonts.ready")

    def phase(label):
        page.locator("#ticks").get_by_role("button", name=label, exact=True).evaluate("button => button.click()")
        expect(page.locator("#phase-label")).to_have_text(label)
        page.wait_for_function("!document.querySelector('#original').seeking && document.querySelector('#original').readyState >= 2")

    def factor(value):
        page.locator("#compare-factor").evaluate(
            "(input, value) => { input.value = value; input.dispatchEvent(new Event('input')); }", value
        )

    def shot(name):
        expect(page.locator("#joints")).to_be_visible()
        expect(page.locator("#exaggerated")).to_be_visible()
        assert page.locator("#ticks").evaluate("""ticks => {
            const visible = [...ticks.children].filter(el => getComputedStyle(el).visibility === 'visible');
            return visible.every((a, i) => visible.slice(i + 1).every(b => {
                const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
                return a.style.top !== b.style.top || x.right <= y.left || y.right <= x.left;
            }));
        }""")
        if name != "04_fault2.png":
            assert buttons.first.locator(".finding-numbers > span").all_text_contents() == [
                page.locator("#compare-values > span").nth(i).text_content() for i in range(2)
            ]
        overlay.screenshot(path=shots / name)

    buttons.first.click()
    phase("임팩트")
    shot("01_base.png")
    factor(1)
    def geometry(identity=False):
        left, right = page.evaluate("[poseTrace.joints, poseTrace.exaggerated]")
        assert len(left["points"]) == len(right["points"]) == 18
        assert len(left["links"]) == len(right["links"]) == 18
        assert left["guides"] == right["guides"]
        for pose in (left, right):
            assert all(endpoint in pose["points"] for link in pose["links"] for endpoint in link)
        def pelvis(pose):
            return [(a + b) / 2 for a, b in zip(pose["points"][8], pose["points"][9])]
        assert max(abs(a - b) for a, b in zip(pelvis(left), pelvis(right))) < 1e-9
        for i, (a, b) in enumerate(zip(left["links"], right["links"])):
            tolerance = 0.15 * dist(*a) if i in (7, 8) else 0
            assert abs(dist(*a) - dist(*b)) <= tolerance + 1e-9, (i, a, b)
        max_delta = max(abs(a - b) for p, q in zip(left["points"], right["points"]) for a, b in zip(p, q))
        if identity:
            assert max_delta == 0, max_delta
        print("Geometry:", {"coordinate_delta_px": max_delta, "pelvis_px": pelvis(left),
                            "joints": len(left["points"]), "links": len(left["links"]), "guides": left["guides"]})

    geometry(identity=True)
    evidence = video_track["evidence"]
    points = evidence["frames"][evidence["phase_frames"]["impact"]]
    shoulder_y = (points[11][1] + points[12][1]) / 2
    ankle_y = (points[27][1] + points[28][1]) / 2
    fraction = (ankle_y - shoulder_y) / evidence["overlay_crop"][2]
    assert fraction >= 0.55, fraction
    print("Impact crop:", evidence["overlay_crop"], "shoulder-to-ankle fraction:", fraction)
    shot("02_scale1.png")
    ghost = page.locator("#compare-reference")
    ghost.click()
    assert page.evaluate("poseTrace.joints.guides === 0 && poseTrace.exaggerated.guides === 0")
    shot("03_noghost.png")
    ghost.click()
    buttons.nth(1).click()
    expect(buttons.nth(1)).to_have_attribute("aria-pressed", "true")
    expect(page.locator("#compare-values strong")).to_have_text("골반 회전")
    page.wait_for_function("!document.querySelector('#original').seeking")
    geometry()
    shot("04_fault2.png")
    buttons.first.click()
    phase("백스윙 탑")
    factor(2.5)
    geometry()
    shot("05_top.png")
    page.set_viewport_size({"width": 390, "height": 844})
    left = page.locator("#joints").locator("xpath=../../..").bounding_box()
    right = page.locator("#compare-stage").bounding_box()
    assert right["y"] > left["y"], (left, right)
    shot("06_mobile.png")


def main():
    with tempfile.TemporaryDirectory() as tracks, ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        Handler.tracks = Path(tracks)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(channel="chrome")
                page = browser.new_page(viewport={"width": 1360, "height": 1040}, device_scale_factor=2)
                capture(page, f"http://127.0.0.1:{server.server_port}/", Path(tracks))
        finally:
            server.shutdown()
            worker.join()


if __name__ == "__main__":
    main()
