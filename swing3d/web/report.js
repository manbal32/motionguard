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
  theme(matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
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
        image.alt = "선택 프레임의 실측 자세와 교육용 과장 자세";
        const caption = node("figcaption", saved.label ?? "선택 프레임");
        caption.append(" · ", number(saved.frame, "프레임", 0), " · ", number(saved.factor, "×"));
        figure.append(image, caption, node("p", saved.values, "num"));
        byId("report-image").append(figure);
      } else {
        byId("report-image").append(node("p", "이 탭에 비교 이미지가 없습니다. 도구의 비교 화면에서 리포트를 다시 열면 현재 자세가 담깁니다."));
      }
    }
    doc ??= await load(track);
    const items = render(byId("report-findings"), track, doc);
    byId("title").textContent = items[0]?.label ?? "스윙 네 국면을 계측했습니다";
    byId("summary").textContent = doc.mode ? (doc.mode === "demo" ? "데모 피드백 · 실제 영상 계측" : "Gemini 종합 피드백")
      : items.length ? "제공된 판정 파일을 바탕으로 표시했습니다."
      : "판정 파일이 연결되면 해당 국면과 근거를 함께 표시합니다.";
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
        const measured = key !== "wrist" || track.meta.wrist_source === "index";
        const cell = row.insertCell();
        const value = measured ? number(actual) : node("span", "—");
        if (measured && Math.abs(actual - reference) >= 8) value.classList.add("delta");
        const model = number(reference);
        model.classList.add("reference");
        cell.append(value, model);
      }
      if (track.evidence && phase !== "finish") {
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
