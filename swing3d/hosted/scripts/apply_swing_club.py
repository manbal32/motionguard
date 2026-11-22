"""Place optional swing inputs beside the video and summarize them after upload."""
from pathlib import Path

dist = Path(__file__).resolve().parents[1] / 'dist'


def update(name, original, replacement):
    path = dist / name
    source = path.read_text()
    assert original in source, name
    path.write_text(source.replace(original, replacement, 1))


picker = '''<label class="swing-club-picker" id="swing-club-picker">
  <select id="swing-club" aria-label="클럽 선택">
    <option value="">클럽 선택</option>
    <option value="driver">드라이버</option>
    <option value="iron">아이언</option>
    <option value="hybrid">유틸</option>
    <option value="wood">우드</option>
    <option value="wedge">웨지</option>
  </select>
</label>'''
index = dist / 'index.html'
html = index.read_text()
score_start = html.index('<details class="recent-round-card" id="recent-round-card"')
score_end = html.index('</details>', score_start) + len('</details>')
score_card = html[score_start:score_end]
html = html[:score_start] + html[score_end:]
preview_canvas = '업로드한 좌표의 어드레스 자세"></canvas>'
preview_end = preview_canvas + '</div>'
assert preview_end in html
inputs = '<div class="swing-video-inputs">' + picker + score_card + '</div>'
index.write_text(html.replace(preview_end, preview_canvas + inputs + '</div>', 1))

update('index.html',
       '선택한 정지 이미지 5장과 승인한 상담 요약을 외부 AI 서비스에 전송합니다.',
       '정지 이미지 5장과 승인한 상담 요약을 외부 AI 서비스에 전송합니다. 클럽을 선택하면 함께 전송합니다.')

update('demo-start.js', 'log.before(card);', """const club = document.getElementById('swing-club');
const roundScore = document.getElementById('recent-round-score');
const uploadRow = document.createElement('div');
uploadRow.id = 'swing-upload-row';
const swingSettings = document.createElement('button');
swingSettings.type = 'button';
swingSettings.className = 'swing-upload-summary';
swingSettings.setAttribute('aria-controls', 'uploaded-media');
const settingValues = ['클럽', '최근 타수'].map(label => {
  const group = document.createElement('span');
  const value = document.createElement('strong');
  group.append(label + ' ', value);
  if (swingSettings.childElementCount) swingSettings.append(' ');
  swingSettings.append(group);
  return value;
});
const summarizeSettings = () => {
  settingValues[0].textContent = club.value ? club.selectedOptions[0].textContent : '미선택';
  let score;
  try { score = MotionRoundScore.normalize(roundScore.value); } catch {}
  settingValues[1].textContent = score === undefined ? '미입력' : score + '타';
};
club.addEventListener('change', summarizeSettings);
roundScore.addEventListener('input', summarizeSettings);
uploadRow.append(card, swingSettings);
log.before(uploadRow);""")
update('demo-start.js', 'card.after(agreement);', 'uploadRow.after(agreement);')
update('demo-start.js', "card.hidden=!file;if(file){name.textContent='';",
       "uploadRow.hidden = card.hidden = !file; summarizeSettings(); if(file){name.textContent='';")
update('demo-start.js', "card.onclick=()=>{media.open=!media.open;",
       """card.onclick = swingSettings.onclick = event => {
  media.open = !media.open;
  if (media.open && event.currentTarget === swingSettings) {
    document.getElementById('recent-round-card').open = true;
  }
""")
update('demo-start.js', 'card.after(media);', 'uploadRow.after(media);')
update('demo-start.js', "card.setAttribute('aria-expanded',String(media.open));",
       "card.setAttribute('aria-expanded',String(media.open));swingSettings.setAttribute('aria-expanded',String(media.open));")
update('demo-start.js', "media.addEventListener('toggle',()=>{card.setAttribute('aria-expanded',String(media.open));",
       "media.addEventListener('toggle',()=>{card.setAttribute('aria-expanded',String(media.open));swingSettings.setAttribute('aria-expanded',String(media.open));")

update('instrument.js', '    const replacing=!!selected;byId("upload").dataset.ready="false";',
       '''    const replacing = !!selected;
    if (replacing) byId("swing-club").value = "";
    byId("upload").dataset.ready = "false";''')
update('instrument.js', '    lastApprovedSummary={...approvedSummary};',
       '''    const swingClub = byId("swing-club").value;
    approvedSummary = {...approvedSummary};
    delete approvedSummary.swing_club;
    if (!csv && swingClub) approvedSummary.swing_club = swingClub;
    lastApprovedSummary={...approvedSummary};''')
update('client-api.js', '    const profile=await access(\'profiles\',data.profile_id)',
       '''    const swingClub = doc.visual_analysis?.input_receipt?.swing_club;
    if (swingClub) doc.swing_club = swingClub;
    const profile=await access('profiles',data.profile_id)''')
update('client-api.js', '    entry.ai_photo=', '    if (swingClub) entry.swing_club = swingClub;\n    entry.ai_photo=')

css = dist / 'experience.css'
with css.open('a') as sheet:
    sheet.write("""
#preview-slot:has(> .swing-video-inputs) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(132px, 43%);
  column-gap: 8px;
  height: auto;
  max-height: none;
  min-height: clamp(110px, 18vh, 150px);
  padding-inline-end: 10px;
}
#preview-slot:has(> .swing-video-inputs) > :not(.swing-video-inputs) {
  grid-area: 1 / 1;
  justify-self: center;
  min-width: 0;
}
#preview-slot > .capture-illustration { height: clamp(110px, 18vh, 150px); }
#preview-slot > .swing-video-inputs { grid-area: 1 / 2; }
.swing-video-inputs { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; padding-block: 6px; }
.swing-club-picker { position: relative; display: block; }
.swing-club-picker select {
  appearance: none;
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 8px 28px 8px 10px;
  border: 1px solid #b5cfbf;
  border-radius: 10px;
  background: #fff;
  color: #1b5d40;
  font: inherit;
  font-size: 16px;
  font-weight: 650;
  cursor: pointer;
}
.swing-club-picker select:focus-visible { outline: 2px solid #176b49; outline-offset: 2px; }
.swing-club-picker::after {
  content: "";
  position: absolute;
  top: calc(50% - 5px);
  inset-inline-end: 13px;
  width: 7px;
  height: 7px;
  border-inline-end: 2px solid #417a5d;
  border-block-end: 2px solid #417a5d;
  transform: rotate(45deg);
  pointer-events: none;
}
#upload .swing-video-inputs .recent-round-card {
  position: relative;
  margin: 0;
  padding: 0 8px;
  border: 1px solid #b5cfbf;
  border-radius: 10px;
  background: #fff;
}
#upload .swing-video-inputs .recent-round-heading { min-height: 44px; gap: 4px; }
#upload .swing-video-inputs .recent-round-label { font-size: 13px; white-space: nowrap; }
#upload .swing-video-inputs .recent-round-optional { padding: 0; font-size: 12px; }
.swing-video-inputs .recent-round-card[open] .recent-round-optional { display: none; }
.swing-video-inputs .recent-round-card[open] .recent-round-heading { margin-inline-end: 50px; }
.swing-video-inputs .recent-round-input {
  position: absolute;
  inset-block-start: 0;
  inset-inline-end: 1px;
  width: 48px;
}
.swing-video-inputs .recent-round-input > input {
  min-height: 44px;
  border: 0;
  border-inline-start: 1px solid #d5e5db;
  border-radius: 0 8px 8px 0;
  padding: 4px;
  text-align: center;
}
#upload .swing-video-inputs #recent-round-hint {
  display: none;
  margin: 0 0 6px;
  font-size: 11px;
  line-height: 1.35;
}
#upload .swing-video-inputs .recent-round-card:has(input:focus) #recent-round-hint { display: block; }
#swing-upload-row { display: flex; align-items: stretch; gap: 6px; flex: none; }
#swing-upload-row[hidden] { display: none; }
#swing-upload-row #conversation-file {
  flex: 1;
  justify-content: center;
  width: auto;
  min-width: 0;
  max-width: none;
  min-height: 48px;
  padding: 5px 7px;
}
#swing-upload-row #conversation-file > span:first-child,
#swing-upload-row #conversation-file .conversation-file-action { display: none; }
#swing-upload-row #conversation-file strong { text-align: center; font-size: 14px; word-break: keep-all; }
.swing-upload-summary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: none;
  min-height: 48px;
  padding: 5px 8px;
  border: 1px solid #cbded2;
  border-radius: 12px;
  background: #fff;
  color: #426754;
  font-size: 13px;
  white-space: nowrap;
}
.swing-upload-summary strong { color: #1b5d40; font: inherit; font-weight: 700; }
@media (max-width: 350px) {
  #swing-upload-row #conversation-file strong { font-size: 12px; }
  .swing-upload-summary { gap: 6px; padding-inline: 6px; font-size: 12px; }
}
""")
