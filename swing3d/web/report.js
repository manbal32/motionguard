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

  try {
    const id = location.pathname.split("/").at(-1);
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("리포트 주소가 올바르지 않습니다.");
    const response = await fetch("/api/track/" + id);
    if (!response.ok) throw new Error("저장된 트랙을 찾지 못했습니다.");
    const track = await response.json();
    const items = render(byId("report-findings"), track, await load(track));
    byId("title").textContent = items[0]?.label ?? "스윙 네 국면을 계측했습니다";
    byId("summary").textContent = items.length ? "제공된 판정 파일을 바탕으로 표시했습니다."
      : "판정 파일이 연결되면 해당 국면과 근거를 함께 표시합니다.";
    byId("facts").append(number(track.meta.dur, "s"), " · ", number(track.meta.fps, "fps"), " · ", number(track.meta.samples, "표본", 0));
    byId("wrist-limit").textContent = track.meta.wrist_source === "index"
      ? "검지 방향으로 샤프트를 근사한 추정값입니다." : "검지 좌표가 없어 손목 각도를 판정하지 않습니다.";
    const table = byId("report-angles");
    const keys = ["swing","torso","hips","lean","wrist"];
    const head = table.createTHead().insertRow();
    for (const label of ["국면", ...keys.map(key => channels[key])]) head.append(node("th", label));
    const body = table.createTBody();
    for (const [index, [phase, label]] of phases.slice(0, 4).entries()) {
      const frame = track.meta.phase_frames?.[phase];
      const start = track.meta.source_frames?.[0] ?? 0;
      const fraction = (track.events[phase] * track.meta.dur - track.meta.hold) / (track.meta.dur - track.meta.hold);
      const sample = Math.max(0, Math.min(track.track.length - 1, frame === undefined
        ? Math.round(fraction * (track.track.length - 1)) : frame - start));
      const row = body.insertRow();
      row.append(node("th", label));
      for (const key of keys) {
        const actual = track.track[sample][track.channels.indexOf(key)] * 180 / Math.PI;
        const reference = SwingReference[key][index];
        const measured = key !== "wrist" || track.meta.wrist_source === "index";
        const cell = row.insertCell();
        const value = measured ? number(actual) : node("span", "—");
        if (measured && Math.abs(actual - reference) >= 8) value.classList.add("delta");
        const model = number(reference);
        model.classList.add("reference");
        cell.append(value, model);
      }
      if (track.evidence) {
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
  } catch (error) {
    byId("report-status").textContent = error.message + " 도구 화면에서 분석을 다시 실행해 주세요.";
  }
})();
