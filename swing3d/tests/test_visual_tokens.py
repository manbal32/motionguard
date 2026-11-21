"""Customer styling has one palette and typography source (vendor files excluded)."""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]

def test_application_uses_palette_and_type_tokens():
    colors=[];fonts=[]
    for path in (ROOT/'web').rglob('*'):
        if not path.is_file() or 'vendor' in path.parts or path.name=='tokens.css' or path.suffix not in {'.css','.js','.html','.svg'}:continue
        source=path.read_text()
        if re.search(r'#[0-9a-fA-F]{3,8}\b|0x[0-9a-fA-F]{6}\b',source):colors.append(str(path.relative_to(ROOT)))
        if re.search(r'font-size\s*:\s*(?!var\()[\d.]|font\s*:[^;}]*\d+(?:px|rem|em)|font-size="[\d.]',source):fonts.append(str(path.relative_to(ROOT)))
    assert not colors,colors
    assert not fonts,fonts
