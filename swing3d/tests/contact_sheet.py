"""Capture both live comparison panes at each phase using the bundled sample."""
import argparse
from io import BytesIO
from math import dist
import shutil
from pathlib import Path
import tempfile
import threading

from PIL import Image
from playwright.sync_api import expect, sync_playwright

from shots import ROOT, Handler, ThreadingHTTPServer

PHASES = ("어드레스", "백스윙 탑", "다운스윙", "임팩트", "피니시")


def capture(page, url):
    # Use the real fixture endpoint while keeping video extraction and rendering live.
    page.route("**/api/coaching/analyze",
               lambda route: route.fulfill(response=page.request.get(url + "api/findings/golf1")))
    page.add_init_script("""window.renderedPoses = {};
      const clear = CanvasRenderingContext2D.prototype.clearRect;
      const arc = CanvasRenderingContext2D.prototype.arc;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        if (this.canvas.id === 'joints') renderedPoses.left = [];
        return clear.apply(this, args);
      };
      CanvasRenderingContext2D.prototype.arc = function (x, y, ...args) {
        if (this.canvas.id === 'joints') renderedPoses.left.push([x,y]);
        return arc.call(this,x,y,...args);
      };
      document.addEventListener('DOMContentLoaded', () => {
        const original = SwingPoseAvatar;
        window.SwingPoseAvatar = {...original, paint(ctx, pose, ...args) {
          if (ctx.canvas.id === 'exaggerated') renderedPoses.right = pose;
          return original.paint(ctx, pose, ...args);
        }};
      });
    """)
    page.goto(url)
    page.locator("#video").set_input_files(ROOT / "samples/golf_swing.mp4")
    page.locator("#start").click()
    page.locator("#summary-approve").click()
    expect(page.locator("#finding-options [data-finding=limited_torso_turn]")).to_be_visible(timeout=120000)
    frames = []
    differences = []
    alignment = []
    measured_top = exaggerated_top = None
    indices = list(range(11, 17)) + [19, 20] + list(range(23, 33))
    anchors = (11, 12, 23, 24, 27, 28)
    for phase in PHASES:
        page.locator("#ticks").get_by_text(phase, exact=True).evaluate("button => button.click()")
        expect(page.locator("#phase-label")).to_have_text(phase)
        page.wait_for_function("!document.querySelector('#original').seeking && document.querySelector('#original').readyState >= 2")
        for factor in (1, 2.5):
            page.locator("#compare-factor").evaluate(
                "(input, value) => { input.value = value; input.dispatchEvent(new Event('input')); }", factor
            )
            left, right = page.evaluate("""() => ['joints','exaggerated'].map((id, i) => {
                const canvas = document.getElementById(id);
                const rect = canvas.getBoundingClientRect();
                const stage = canvas.closest('.video-stage').getBoundingClientRect();
                const points = renderedPoses[i ? 'right' : 'left'];
                return points.map(([x,y]) => [rect.x - stage.x + x * rect.width / canvas.width,
                    rect.y - stage.y + y * rect.height / canvas.height]);
            })""")
            if factor == 1:
                alignment.extend(dist(left[indices.index(i)], right[i]) for i in anchors)
            if phase == PHASES[1]:
                if factor == 1:
                    measured_top = right
                else:
                    exaggerated_top = right
            frames.append(Image.open(BytesIO(page.locator("#overlay").screenshot())).convert("RGB"))
        values = page.locator("#compare-values > span").all_text_contents()
        displayed, measured = (float(values[i].split()[-1].removesuffix("°")) for i in (3, 0))
        differences.append(round(displayed - measured, 1))
    print("Phase differences (degrees):", differences)
    width = max(image.width for image in frames)
    height = max(image.height for image in frames)
    sheet = Image.new("RGB", (width * 2, height * len(PHASES)), "#0c100f")
    for index, image in enumerate(frames):
        sheet.paste(image, (index % 2 * width, index // 2 * height))
    target = ROOT / "mockups/shots/contact_04.png"
    sheet.save(target)
    print(target)
    mean_alignment = sum(alignment) / len(alignment)
    movement = max(dist(measured_top[i], exaggerated_top[i]) for i in (11, 12))
    fixed = max(dist(measured_top[i], exaggerated_top[i]) for i in (23, 24, 27, 28))
    bones = [(11,12), (11,13), (12,14), (13,15), (14,16), (15,19), (16,20),
             (11,23), (12,24), (23,24), (23,25), (24,26), (25,27), (26,28),
             (27,29), (28,30), (29,31), (30,32)]
    length_change = max(abs(dist(exaggerated_top[a], exaggerated_top[b]) / length - 1) * 100
                        for a, b in bones if (length := dist(measured_top[a], measured_top[b])) > 0)
    print(f"Alignment {mean_alignment:.2f}px; visibility {abs(differences[1]):.1f}° / {movement:.2f}px; "
          f"preservation {fixed:.2f}px / {length_change:.2f}%")
    assert (mean_alignment <= 4 and abs(differences[1]) >= 8 and movement >= 20
            and fixed <= 6 and length_change <= 3), "One or more visual acceptance criteria failed"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--single-process", action="store_true", help="Use Chromium's single process mode")
    parser.add_argument("--cached-tracks", type=Path, help="Reuse previously measured video evidence")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as tracks, ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        Handler.tracks = Path(tracks)
        if args.cached_tracks:
            for path in args.cached_tracks.iterdir():
                shutil.copyfile(path, Handler.tracks / path.name)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(args=["--single-process"] if args.single_process else [])
                page = browser.new_page(viewport={"width": 1360, "height": 1040})
                capture(page, f"http://127.0.0.1:{server.server_port}/")
        finally:
            server.shutdown()
            thread.join()


if __name__ == "__main__":
    main()
