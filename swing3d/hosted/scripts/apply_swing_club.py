"""Place optional swing-club selection beside the video entry and attached card."""
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
update('index.html', '업로드한 좌표의 어드레스 자세"></canvas></div>', '업로드한 좌표의 어드레스 자세"></canvas>' + picker + '</div>')

update('index.html',
       '선택한 정지 이미지 5장과 승인한 상담 요약을 외부 AI 서비스에 전송합니다.',
       '정지 이미지 5장과 승인한 상담 요약을 외부 AI 서비스에 전송합니다. 클럽을 선택하면 함께 전송합니다.')

update('demo-start.js', 'log.before(card);', """const picker = document.getElementById('swing-club-picker');
const previewSlot = document.getElementById('preview-slot');
const uploadRow = document.createElement('div');
uploadRow.id = 'swing-upload-row';
uploadRow.append(card);
log.before(uploadRow);""")
update('demo-start.js', 'card.after(agreement);', 'uploadRow.after(agreement);')
update('demo-start.js', 'card.after(media);', 'uploadRow.after(media);')
update('demo-start.js', "card.hidden=!file;if(file){name.textContent='';",
       """uploadRow.hidden = card.hidden = !file;
if (file) uploadRow.append(picker);
else previewSlot.append(picker);
if(file){name.textContent='';""")

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
#preview-slot:has(> .swing-club-picker) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 8px;
  padding-inline-end: 10px;
}
#preview-slot:has(> .swing-club-picker) > :not(.swing-club-picker) {
  grid-area: 1 / 1;
  justify-self: center;
  min-width: 0;
}
#preview-slot > .swing-club-picker { grid-area: 1 / 2; }
.swing-club-picker { position: relative; flex: none; display: block; }
.swing-club-picker select {
  appearance: none;
  display: block;
  min-height: 44px;
  min-width: 103px;
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
#swing-upload-row { display: flex; align-items: center; gap: 8px; flex: none; }
#swing-upload-row[hidden] { display: none; }
#swing-upload-row #conversation-file { flex: 1; min-width: 0; max-width: none; }
@media (max-width: 400px) {
  #swing-upload-row #conversation-file { gap: 6px; padding: 10px 8px; min-height: 52px; }
  #swing-upload-row #conversation-file strong { font-size: 14px; word-break: keep-all; }
  #swing-upload-row #conversation-file > span:first-child { width: 26px; height: 26px; font-size: 18px; }
  #swing-upload-row #conversation-file .conversation-file-action { font-size: 17px; }
}
""")
