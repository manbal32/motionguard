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


def chat(page, mobile):
    message = page.locator("#coach-message")
    send = page.locator("#coach-send")
    expect(send).to_be_visible()
    queued = []
    endpoint = "**/api/coaching/chat"
    page.route(endpoint, lambda route: queued.append(route))
    if mobile:
        assert send.bounding_box()["height"] >= 44
    else:
        message.fill("   ")
        message.press("Enter")
        expect(page.locator("#coach-log li")).to_have_count(0)
        message.fill("한글 조합 검증")
        message.evaluate("""input => {
            input.dispatchEvent(new CompositionEvent('compositionstart'));
            input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
            input.dispatchEvent(new CompositionEvent('compositionend'));
            input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', isComposing: true, bubbles: true}));
            input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', keyCode: 229, bubbles: true}));
        }""")
        expect(page.locator("#coach-log li")).to_have_count(0)
        message.fill("드라이버에서 슬라이스가 납니다.")
        message.press("End")
        message.press("Shift+Enter")
        expect(message).to_have_value("드라이버에서 슬라이스가 납니다.\n")
        expect(page.locator("#coach-log li")).to_have_count(0)
        message.press("Enter")
        expect(page.locator("#coach-form")).to_have_attribute("aria-busy", "true")
        expect(page.locator("#coach-status")).to_contain_text("답변을 기다리는 중")
        expect(page.locator("#coach-log li")).to_have_count(1)
        expect(send).to_be_disabled()
        expect(page.locator("#start")).to_be_disabled()
        message.press("Enter")
        page.locator("#coach-form").evaluate("form => form.requestSubmit()")
        assert len(queued) == 1
        queued.pop().abort()
        expect(page.locator("#coach-status")).to_contain_text("다시 보낼 수 있습니다")
        expect(message).to_have_value("드라이버에서 슬라이스가 납니다.\n")
        expect(message).to_be_focused()
    assert not queued
    page.unroute(endpoint)

    for text in ["드라이버에서 슬라이스가 납니다. 골반 회전이 부족한 것 같아요.",
                 "다운스윙에서 자세를 유지하고 싶습니다."]:
        message.fill(text)
        with page.expect_response(endpoint):
            if mobile:
                send.tap()
            else:
                message.press("Enter")
        expect(message).to_have_value("")
        if not mobile:
            expect(message).to_be_focused()
    expect(page.locator("#coach-log li")).to_have_count(4)
    expect(page.locator("#coach-log")).to_contain_text("데모 응답")


def run(browser, url, width, name, output):
    page = browser.new_page(viewport={"width": width, "height": 844 if width == 390 else 1040},
                            device_scale_factor=2, has_touch=width == 390, is_mobile=width == 390)
    errors = []
    analyses = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda request: analyses.append(request.url)
            if request.method == "POST" and request.url.endswith(("/api/video", "/api/coaching/analyze")) else None)
    page.add_init_script(f"({TRACE})();")
    page.goto(url)
    page.locator("#video").set_input_files(ROOT / "samples/golf_swing.mp4")
    expect(page.locator("#coach-panel")).to_be_visible()
    chat(page, width == 390)
    assert not analyses
    page.locator("#upload").screenshot(path=output / f"mvp_{name}_consultation.png")

    page.locator("#start").click()
    review = page.locator("#summary-review")
    expect(review).to_be_visible()
    assert not analyses
    if width != 390:
        page.locator("#summary-cancel").click()
        expect(review).to_be_hidden()
        page.locator("#start").click()
        expect(review).to_be_visible()
        assert not analyses
    page.locator("#summary-edit").click()
    goal = "수정 승인 · 다운스윙에서 자세를 유지"
    review.locator("[name=goal]").fill(goal)
    assert not analyses
    review.screenshot(path=output / f"mvp_{name}_summary.png")
    if width != 390:
        assert page.request.post(url + "/api/coaching/analyze", data={"allow_external": False}).status == 422
    # The bundled wide shot has no reliable strength. Inject a visibly marked fixture for the selection UI.
    def add_positive(route):
        response = route.fetch(timeout=60000)
        data = response.json()
        if response.ok and not data["positives"]:
            track = page.request.get(url + "/api/track/" + data["track_id"]).json()
            phase, frame, channel, measured, model = page.evaluate("""track => {
                const reference = SwingReference.expand(track);
                for (const phase of ['down','impact','finish','address']) {
                    const frame = track.meta.phase_frames[phase];
                    const row = frame - track.meta.source_frames[0];
                    for (const key of ['lean','kneeL','kneeR','swing']) {
                        const measured = track.track[row][track.channels.indexOf(key)] * 180 / Math.PI;
                        const model = reference[row][SwingReference.channels.indexOf(key)] * 180 / Math.PI;
                        if (Math.abs(measured-model) < 7.95) return [phase, frame, key, measured, model];
                    }
                }
            }""", track)
            time = track["events"][phase]
            data["positives"] = [{"id": "fixture_positive", "phase": phase, "frame": frame, "channel": channel,
                                  "range": [max(0,time - .02), min(1,time + .02)], "confidence": .9, "reliable": True,
                                  "measured": measured, "reference": model, "difference": measured - model,
                                  "example_only": True}]
            if route.request.method == "POST":
                page.route("**/api/coaching/report/" + data["report_id"], lambda report: report.fulfill(json=data))
        route.fulfill(response=response, json=data)
    page.route("**/api/coaching/analyze", add_positive)
    with page.expect_response("**/api/coaching/analyze", timeout=60000) as analyzed:
        page.locator("#summary-approve").click()
    result = analyzed.value.json()
    assert len(analyses) == 2, analyses
    sent = analyzed.value.request.post_data_json
    assert sent["approved"] is True and "messages" not in sent
    assert sent["conversation_summary"] == result["conversation_summary"]
    assert result["conversation_summary"]["goal"] == goal
    assert result["mode"] == "demo" and 0 < len(result["findings"]) <= 3, result
    expect(page.locator("#finding-body")).to_contain_text("슬라이스")
    expect(page.locator("#finding-body")).to_contain_text("잘한 점")
    page.locator("#findings").screenshot(path=output / f"mvp_{name}_findings.png")
    link = page.locator("#finding-body a").first
    expect(link).to_have_attribute("href", YOUTUBE)
    improvements = page.get_by_role("group", name="개선점 · 교정")
    button = improvements.get_by_role("button").first
    first = result["findings"][0]
    expect(page.locator("#timecode")).to_contain_text(str(first["frame"]) + "프레임")
    page.wait_for_function("!document.querySelector('#original').seeking")
    assert page.locator("#compare-factor").input_value() == {"low": "1.5", "medium": "2", "high": "2.5"}[first["severity"]]
    assert page.evaluate("""() => {
        const c = document.querySelector('#exaggerated');
        const points = poseTrace.exaggerated.points;
        const pose = poseTrace.joints.points;
        return points.length > 0 && pose.length === points.length
            && c.dataset.pelvis === document.querySelector('#joints').dataset.pelvis
            && c.getContext('2d').getImageData(0,0,c.width,c.height).data.filter((v,i)=>i%4===3&&v>240).length > 600;
    }""")
    page.locator("#overlay").screenshot(path=output / f"mvp_{name}_comparison.png")
    page.locator("#compare-factor").evaluate("el => {el.value = 1; el.dispatchEvent(new Event('input'));}")
    assert page.evaluate("JSON.stringify(poseTrace.joints.points) === JSON.stringify(poseTrace.exaggerated.points)")
    if width != 390:
        overlay = page.locator("#overlay")
        overlay.screenshot(path=output / "avatar_1x.png")
        page.locator("#compare-factor").evaluate("el => {el.value = 2.5; el.dispatchEvent(new Event('input'));}")
        displacement = page.evaluate("""Math.max(...poseTrace.joints.points.map(([x,y],i) => {
            const [a,b] = poseTrace.exaggerated.points[i]; return Math.hypot(x-a,y-b);
        }))""")
        assert displacement > 2, displacement
        stance = page.evaluate("""() => {
            const left = poseTrace.joints.points, right = poseTrace.exaggerated.points;
            const delta = indices => Math.max(...indices.map(i => Math.hypot(left[i][0]-right[i][0], left[i][1]-right[i][1])));
            const length = ([a,b]) => Math.hypot(a[0]-b[0], a[1]-b[1]);
            const lengths = poseTrace.joints.links.map((link, i) => Math.abs(length(link)-length(poseTrace.exaggerated.links[i])));
            return {lower:delta([8,9,10,11,12,13,14,15,16,17]), maxLimbLength:Math.max(...lengths.filter((_,i)=>i!==7&&i!==8))};
        }""")
        assert stance["lower"] == 0 and stance["maxLimbLength"] < 1e-8, stance
        print("2.5x torso stance/limbs:", stance)
        print("2.5x maximum image-coordinate displacement:", displacement)
        overlay.screenshot(path=output / "avatar_25x_frame_1.png")
        for i in (2, 3):
            page.locator("#next").click()
            expect(page.locator("#joints")).to_have_attribute("data-frame", str(first["frame"] + i - 1))
            expect(page.locator("#exaggerated")).to_have_attribute("data-frame", str(first["frame"] + i - 1))
            overlay.screenshot(path=output / f"avatar_25x_frame_{i}.png")
        improvements.get_by_role("button").nth(1).click()
        expect(page.locator("#compare-values strong")).to_have_text("골반 회전")
        page.locator("#compare-factor").evaluate("el => {el.value = 2.5; el.dispatchEvent(new Event('input'));}")
        assert page.evaluate("poseTrace.joints.points.slice(12).every((p,i) => p.every((x,j) => x === poseTrace.exaggerated.points[i+12][j]))")
        overlay.screenshot(path=output / "avatar_second_finding.png")
        page.locator("#ticks").get_by_role("button", name="피니시", exact=True).evaluate("button => button.click()")
        expect(page.locator("#phase-label")).to_have_text("피니시")
        page.wait_for_function("!document.querySelector('#original').seeking")
        overlay.screenshot(path=output / "avatar_finish.png")
        button.click()
        page.locator("#speed").click()
        assert page.locator("#original").evaluate("v => v.playbackRate") == .5
        page.locator("#compare-loop").click()
        page.wait_for_function("!document.querySelector('#original').seeking")
        page.evaluate("""() => {
            const v = document.querySelector('#original');
            window.loopTimes = [];
            v.addEventListener('seeked', () => loopTimes.push(v.currentTime));
        }""")
        page.locator("#play").click()
        page.wait_for_function("loopTimes.length >= 3")
        times = page.evaluate("loopTimes")
        assert max(times) - min(times) < .04, times
        print("Loop restart timestamps:", times)
        expect(page.locator("#original")).to_have_js_property("paused", False)
        page.locator("#play").click()
        expect(page.locator("#original")).to_have_js_property("paused", True)
        page.locator("#compare-loop").click()
    positive = page.get_by_role("group", name="잘한 점 · 유지").get_by_role("button").first
    positive.click()
    expect(page.locator("#joints")).to_have_attribute("data-frame", str(result["positives"][0]["frame"]))
    expect(page.locator("#exaggerated")).to_have_attribute("data-frame", str(result["positives"][0]["frame"]))
    expect(page.locator("#compare-cue")).to_contain_text("유지할 동작")
    expect(page.locator("#compare-factor")).to_be_disabled()
    expect(page.locator("#compare-factor")).to_have_value("1")
    assert page.evaluate("JSON.stringify(poseTrace.joints.points) === JSON.stringify(poseTrace.exaggerated.points)")
    page.locator("#overlay").screenshot(path=output / f"mvp_{name}_positive.png")
    button.evaluate("element => element.click()")
    page.wait_for_function("!document.querySelector('#original').seeking")
    if width != 390:
        assert not page.evaluate("Boolean(window.Swing3D || window.THREE)")
        page.locator("#swing-details > summary").click()
        expect(page.locator("#viewer canvas")).to_be_visible()
        with page.expect_download(timeout=60000) as recording:
            page.locator("#record").click()
        assert recording.value.suggested_filename.endswith(".webm") and recording.value.path().stat().st_size > 1000
        page.evaluate("window.Swing3D.dispose()")
    page.locator("#open-report").click()
    page.wait_for_url("**/report/*?coaching=*")
    expect(page.locator("#report-image img")).to_be_visible()
    expect(page.locator("#report-findings")).to_contain_text("데모 피드백")
    expect(page.locator("#report-findings")).to_contain_text(goal)
    expect(page.locator("#report-stills figure")).to_have_count(5)
    expect(page.locator(".finding-still")).to_have_count(3)
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
                browser = playwright.chromium.launch(channel="chrome", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
                output = ROOT / "mockups" / "shots"
                for width, name in [(1360, "desktop"), (390, "mobile")]:
                    run(browser, f"http://127.0.0.1:{server.server_port}", width, name, output)
        finally:
            server.shutdown()
            thread.join()


if __name__ == "__main__":
    main()
