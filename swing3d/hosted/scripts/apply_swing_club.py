"""Place editable swing inputs alongside the video upload controls."""
from pathlib import Path

dist = Path(__file__).resolve().parents[1] / 'dist'


def update(name, original, replacement):
    path = dist / name
    source = path.read_text()
    assert original in source, name
    path.write_text(source.replace(original, replacement, 1))


picker = '''<div class="swing-upload-field">
  <label class="swing-field-label" for="swing-club">클럽 선택</label>
  <select id="swing-club">
    <option value="">미선택</option>
    <option value="driver">드라이버</option>
    <option value="iron">아이언</option>
    <option value="hybrid">유틸</option>
    <option value="wood">우드</option>
    <option value="wedge">웨지</option>
  </select>
</div>'''
index = dist / 'index.html'
html = index.read_text()
score_start = html.index('<div class="swing-upload-field" id="recent-round-card"')
score_end = html.index('</div>', score_start) + len('</div>')
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

update('demo-start.js', 'log.before(card);', """const previewSlot = document.getElementById('preview-slot');
const inputs = previewSlot.querySelector('.swing-video-inputs');
const uploadRow = document.createElement('div');
uploadRow.id = 'swing-upload-row';
uploadRow.append(card);
log.before(uploadRow);""")
update('demo-start.js', 'card.after(agreement);', 'uploadRow.after(agreement);')
update('demo-start.js', "card.hidden=!file;if(file){name.textContent='';",
       """uploadRow.hidden = card.hidden = !file;
if (file) uploadRow.append(inputs);
else previewSlot.append(inputs);
if(file){name.textContent='';""")
update('demo-start.js', 'card.after(media);', 'uploadRow.after(media);')

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
  gap: 8px;
  height: auto;
  max-height: none;
  padding: 8px;
}
#preview-slot > .capture-illustration { height: clamp(110px, 18vh, 150px); }
#preview-slot #upload-preview { height: min(32vh, 240px); }
#preview-slot:has(#upload-preview:not([hidden])) { height: min(32vh, 240px); max-height: 240px; }
.swing-video-inputs { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
#swing-upload-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; flex: none; }
#swing-upload-row[hidden] { display: none; }
#swing-upload-row .swing-video-inputs { display: contents; }
.swing-upload-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid #b5cfbf;
  border-radius: 10px;
  background: #fff;
}
#upload .swing-field-label {
  display: block;
  margin: 0;
  color: #365d48;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.25;
  word-break: keep-all;
}
.swing-upload-field > :is(select, input) {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  margin-block-start: auto;
  padding: 4px;
  border: 0;
  border-top: 1px solid #dbe9e0;
  border-radius: 0;
  background-color: #fff;
  color: #1b5d40;
  font: inherit;
  font-size: 16px;
  font-weight: 650;
}
.swing-upload-field select {
  appearance: none;
  padding-inline: 1px;
  cursor: pointer;
}
#upload .swing-field-label[for="swing-club"] { display: flex; align-items: center; gap: 2px; }
.swing-field-label[for="swing-club"]::after {
  content: "";
  width: 6px;
  height: 6px;
  margin-inline-start: auto;
  border-inline-end: 1.5px solid currentColor;
  border-block-end: 1.5px solid currentColor;
  transform: rotate(45deg) translateY(-2px);
}
.swing-upload-field input { appearance: textfield; }
.swing-upload-field input::-webkit-inner-spin-button,
.swing-upload-field input::-webkit-outer-spin-button { appearance: none; margin: 0; }
.swing-upload-field > :is(select, input):focus-visible { outline: 2px solid #176b49; outline-offset: 1px; }
#upload #recent-round-hint {
  display: none;
  margin: 0;
  font-size: 11px;
  color: #45634f;
  line-height: 1.35;
  word-break: keep-all;
}
#upload #recent-round-card:focus-within #recent-round-hint { display: block; }
#swing-upload-row #conversation-file {
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  width: 100%;
  max-width: none;
  padding: 6px;
}
#swing-upload-row #conversation-file > span:first-child { display: none; }
#swing-upload-row #conversation-file > span:nth-child(2) { flex: none; }
#swing-upload-row #conversation-file strong { text-align: center; font-size: 14px; word-break: keep-all; }
#swing-upload-row #conversation-file .conversation-file-action { font-size: 15px; line-height: 1; }
@media (max-width: 390px) {
  #swing-upload-row .swing-field-label { font-size: 12px; }
  #swing-upload-row #conversation-file strong { font-size: 13px; }
}
""")
