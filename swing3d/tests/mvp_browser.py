"""Run the offline MVP with real video extraction and capture desktop/mobile screens."""
import os
import re
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread

from playwright.sync_api import expect, sync_playwright

from shots import ROOT, TRACE

sys.path.insert(0, str(ROOT))
from server import Handler, ThreadingHTTPServer

YOUTUBE = re.compile(r"^https://www.youtube.com/results\?search_query=")


def run(browser, url, width, name, output):
    page = browser.new_page(viewport={"width": width, "height": 844 if width == 390 else 1040},
                            device_scale_factor=2)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.add_init_script(f"({TRACE})();")
    page.goto(url)
    page.locator("#video").set_input_files(ROOT / "samples/golf_swing.mp4")
    expect(page.locator("#coach-panel")).to_be_visible()
    for message in ["드라이버에서 슬라이스가 납니다. 골반 회전이 부족한 것 같아요.",
                    "다운스윙에서 자세를 유지하고 싶습니다."]:
        page.locator("#coach-message").fill(message)
        page.locator("#coach-send").click()
        expect(page.locator("#coach-message")).to_have_value("")
    expect(page.locator("#coach-log li")).to_have_count(4)
    expect(page.locator("#coach-log")).to_contain_text("데모 응답")
    page.locator("#upload").screenshot(path=output / f"mvp_{name}_consultation.png")

    with page.expect_response("**/api/coaching/analyze", timeout=60000) as analyzed:
        page.locator("#start").click()
    result = analyzed.value.json()
    assert result["mode"] == "demo" and 0 < len(result["findings"]) <= 3, result
    expect(page.locator("#finding-body")).to_contain_text("슬라이스")
    expect(page.locator("#finding-body")).to_contain_text("잘한 점")
    link = page.locator("#finding-body a").first
    expect(link).to_have_attribute("href", YOUTUBE)
    button = page.locator("#finding-options button").first
    button.click()
    first = result["findings"][0]
    expect(page.locator("#timecode")).to_contain_text(str(first["frame"]) + "프레임")
    page.wait_for_function("!document.querySelector('#original').seeking")
    assert page.locator("#compare-factor").input_value() == {"low": "1.5", "medium": "2", "high": "2.5"}[first["severity"]]
    assert page.evaluate("poseTrace.joints.points.length === 18 && poseTrace.exaggerated.points.length === 18")
    page.locator("#overlay").screenshot(path=output / f"mvp_{name}_comparison.png")
    page.locator("#compare-factor").evaluate("el => {el.value = 1; el.dispatchEvent(new Event('input'));}")
    assert page.evaluate("JSON.stringify(poseTrace.joints.points) === JSON.stringify(poseTrace.exaggerated.points)")
    button.click()
    page.wait_for_function("!document.querySelector('#original').seeking")
    page.locator("#open-report").click()
    page.wait_for_url("**/report/*?coaching=*")
    expect(page.locator("#report-image img")).to_be_visible()
    expect(page.locator("#report-findings")).to_contain_text("데모 피드백")
    expect(page.locator("#report-findings")).to_contain_text("다운스윙에서 자세를 유지")
    expect(page.locator("#report-findings a").first).to_have_attribute("href", YOUTUBE)
    page.evaluate("document.fonts.ready")
    page.locator(".sheet").screenshot(path=output / f"mvp_{name}_report.png")
    page.evaluate("window.print = () => { window.didPrint = true; }")
    page.locator("#print-report").click()
    page.wait_for_function("window.didPrint === true")
    page.emulate_media(media="print")
    expect(page.locator("#print-report")).not_to_be_visible()
    assert page.locator("#report-angles").evaluate("table => table.scrollWidth <= table.parentElement.clientWidth + 1")
    assert page.locator("#report-image img").evaluate("img => img.complete && img.naturalWidth === 960")
    pdf = page.pdf(prefer_css_page_size=True, print_background=True)
    assert pdf.startswith(b"%PDF") and len(pdf) > 30_000
    assert not errors, errors
    print(f"{name}: 2 turns, {len(result['findings'])} findings, seek frame {first['frame']}, PDF {len(pdf)} bytes")
    page.close()


def main():
    os.environ.pop("GEMINI_API_KEY", None)
    with TemporaryDirectory() as tracks, ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        Handler.tracks = Path(tracks)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(channel="chrome")
                output = ROOT / "mockups" / "shots"
                for width, name in [(1360, "desktop"), (390, "mobile")]:
                    run(browser, f"http://127.0.0.1:{server.server_port}", width, name, output)
        finally:
            server.shutdown()
            thread.join()


if __name__ == "__main__":
    main()
