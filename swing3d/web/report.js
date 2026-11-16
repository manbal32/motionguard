/* global SwingFindings, SwingReference */
(async () => {
  const { node, number, phases, channels, load, render } = SwingFindings;
  const byId = id => document.getElementById(id);
  function theme(value) {
    document.documentElement.dataset.theme = value;
    for (const button of document.querySelectorAll("button[data-theme]")) {
      button.setAttribute("aria-pressed", String(button.dataset.theme === value));
    }
  }
  theme("dark");
  let detailsWereOpen;
  const more = byId("report-more");
  window.addEventListener("beforeprint", () => { detailsWereOpen = more.open; more.open = true; });
  window.addEventListener("afterprint", () => { more.open = detailsWereOpen; });
  for (const button of document.querySelectorAll("button[data-theme]")) {
    button.onclick = () => theme(button.dataset.theme);
  }
  byId("print-report").onclick = async () => {
    await document.fonts.ready;
    await Promise.allSettled([...document.images].map(image => image.decode()));
    window.print();
  };

  try {
    const id = location.pathname.split("/").at(-1);
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("리포트 주소가 올바르지 않습니다.");
    const response = await fetch("/api/track/" + id);
    if (!response.ok) throw new Error("저장된 트랙을 찾지 못했습니다.");
    const track = await response.json();
    const coaching = new URLSearchParams(location.search).get("coaching");
    let doc;
    if (coaching) {
      if (!/^[a-f0-9]{32}$/.test(coaching)) throw new Error("상담 리포트 주소가 올바르지 않습니다.");
      const result = await fetch("/api/coaching/report/" + coaching, {cache: "no-store"});
      if (!result.ok) throw new Error("상담 리포트를 읽지 못했습니다.");
      doc = await result.json();
      if (doc.track_id !== id) throw new Error("상담 리포트가 영상 트랙과 일치하지 않습니다.");
      byId("report-comparison").hidden = false;
      let saved;
      try { saved = JSON.parse(sessionStorage.getItem("motionguard:" + coaching)); } catch {}
      if (saved?.image?.startsWith("data:image/jpeg;base64,")) {
        const figure = node("figure");
        const image = node("img");
        image.src = saved.image;
        image.alt = saved.positive ? "선택 프레임의 실측 자세와 유지할 동작" : "선택 프레임의 실측 자세와 교육용 과장 자세";
        const caption = node("figcaption", saved.label ?? "선택 프레임");
        caption.append(" · ", number(saved.factor, "×"));
        figure.append(image, caption);
        byId("report-image").append(figure);
      } else {
        byId("report-image").append(node("p", "이 탭에 비교 이미지가 없습니다. 도구의 비교 화면에서 리포트를 다시 열면 현재 자세가 담깁니다."));
      }
    }
    doc ??= await load(track);
    const findings = byId("report-findings");
    const items = render(findings, track, doc, undefined, true);
    byId("title").textContent = "스윙 리포트";
    const blocks = [...findings.children];
    const move = (title, destination) => {
      const block = blocks.find(el => el.querySelector("h3")?.textContent === title);
      if (!block) return;
      block.querySelector("h3").remove();
      for (const child of [...block.children]) destination.append(child);
      block.remove();
    };
    move("상담 요약 · 자기보고", byId("report-question"));
    if (!byId("report-question").children.length) byId("report-question").textContent = "상담 입력이 없습니다.";
    move("전체 요약", byId("summary"));
    move("자기보고와 영상 근거", byId("summary"));
    move("분석 한계", byId("report-limits"));
    if (items[0]?.drill) {
      const practice = byId("first-practice");
      practice.querySelector("p").textContent = items[0].drill;
      practice.hidden = false;
    }
    byId("facts").append(number(track.meta.dur, "s"), " · ", number(track.meta.fps, "fps"), " · ", number(track.meta.samples, "표본", 0));
    byId("wrist-limit").textContent = track.meta.wrist_source === "index"
      ? "검지 방향으로 샤프트를 근사한 추정값입니다." : "검지 좌표가 없어 손목 각도를 판정하지 않습니다.";
    const table = byId("report-angles");
    const referenceTrack = SwingReference.expand(track);
    const keys = ["swing","torso","hips","lean","wrist"];
    const head = table.createTHead().insertRow();
    for (const label of ["국면", ...keys.map(key => channels[key])]) head.append(node("th", label));
    const body = table.createTBody();
    for (const [phase, label] of phases) {
      const frame = track.meta.phase_frames?.[phase];
      const start = track.meta.source_frames?.[0] ?? 0;
      const fraction = (track.events[phase] * track.meta.dur - track.meta.hold) / (track.meta.dur - track.meta.hold);
      const sample = Math.max(0, Math.min(track.track.length - 1, frame === undefined
        ? Math.round(fraction * (track.track.length - 1)) : frame - start));
      const row = body.insertRow();
      row.append(node("th", label));
      for (const key of keys) {
        const actual = track.track[sample][track.channels.indexOf(key)] * 180 / Math.PI;
        const reference = referenceTrack[sample][SwingReference.channels.indexOf(key)] * 180 / Math.PI;
        const unavailable = track.meta.unavailable?.includes(key);
        const measured = !unavailable && (key !== "wrist" || track.meta.wrist_source === "index");
        const cell = row.insertCell();
        const value = measured ? number(actual) : node("span", unavailable ? "이 촬영 각도에서는 측정할 수 없습니다" : "—");
        if (measured && Math.abs(actual - reference) >= 8) value.classList.add("delta");
        const model = unavailable ? node("span", "—") : number(reference);
        model.classList.add("reference");
        cell.append(value, model);
      }
      if (track.evidence && (phase !== "finish" || track.evidence.has_finish_still)) {
        const figure = node("figure");
        const image = node("img");
        image.src = "/api/still/" + id + "/" + phase;
        image.alt = label + " 원본 프레임";
        image.onerror = () => image.replaceWith(node("p", "스틸컷을 읽지 못했습니다."));
        const caption = node("figcaption", label + " · ");
        caption.append(number(track.evidence.phase_frames[phase], "프레임", 0));
        figure.append(image, caption);
        byId("report-stills").append(figure);
      }
    }
    byId("report-body").hidden = false;
    byId("report-status").hidden = true;
    byId("print-report").disabled = false;
  } catch (error) {
    byId("report-status").textContent = error.message + " 도구 화면에서 분석을 다시 실행해 주세요.";
  }
})();
