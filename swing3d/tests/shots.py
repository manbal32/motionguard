"""Capture the live comparison. Run with python tests/shots.py (Playwright and Chrome required)."""

import json
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
          if (actual !== 0 && Math.sign(actual) !== Math.sign(row[index])) violations++;
          comparisons++;
        });
      }
    }
    return {violations, comparisons};
}"""


def capture(page, url, tracks):
    shots = ROOT / "mockups" / "shots"
    shots.mkdir(parents=True, exist_ok=True)
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
    video_signs = page.evaluate(SIGN_CHECK, json.loads(video_file.read_text(encoding="utf-8")))
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
        overlay.screenshot(path=shots / name)

    buttons.first.click()
    phase("임팩트")
    shot("01_base.png")
    factor(1)
    difference = page.evaluate("""() => {
        const read = id => {
          const canvas = document.getElementById(id);
          return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const left = read('joints'), right = read('exaggerated');
        let max = 0, painted = 0;
        for (let i = 0; i < left.length; i++) {
          max = Math.max(max, Math.abs(left[i] - right[i]));
          if (i % 4 === 3 && left[i]) painted++;
        }
        return {max, painted};
    }""")
    assert difference["max"] == 0 and difference["painted"] > 0, difference
    print("Impact canvas comparison:", difference)
    shot("02_scale1.png")
    ghost = page.locator("#compare-reference")
    ghost.click()
    shot("03_noghost.png")
    ghost.click()
    buttons.nth(1).click()
    expect(buttons.nth(1)).to_have_attribute("aria-pressed", "true")
    expect(page.locator("#compare-values strong")).to_have_text("골반 회전")
    page.wait_for_function("!document.querySelector('#original').seeking")
    shot("04_fault2.png")
    buttons.first.click()
    phase("백스윙 탑")
    factor(2.5)
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
