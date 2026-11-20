"""Export the actual player as one research-preview HTML, without identity/chat/video.

Optional locally researched images are never copied into the public web directory.
"""
from pathlib import Path
import argparse,base64,json,re
ROOT=Path(__file__).resolve().parents[1]
def build(report_file,out,images=None):
    report=json.loads(Path(report_file).read_text())
    items=[{k:i[k] for k in ('score','measured','reference')} for i in report['score']['items']
           if all(isinstance(i.get(k),(int,float)) for k in ('score','measured','reference'))]
    if not items:raise ValueError('No valid measured items')
    html=(ROOT/'web/course.html').read_text()
    html=html.replace('<link rel="stylesheet" href="/tokens.css">','<style>'+ (ROOT/'web/tokens.css').read_text()+'</style>')
    html=html.replace('<link rel="stylesheet" href="/course.css">','<style>'+ (ROOT/'web/course.css').read_text()+'</style>')
    html=html.replace('<script src="/course-core.js"></script>','<script>'+ (ROOT/'web/course-core.js').read_text()+'</script>')
    seed="window.MotionCoursePreview={profile:MotionCourse.profile("+json.dumps({'score':{'items':items}},allow_nan=False)+")};"
    if images:
        values=['data:image/png;base64,'+base64.b64encode((Path(images)/f'valley-{i:02}.png').read_bytes()).decode() for i in range(1,10)]
        seed+='window.MotionCourseImages='+json.dumps(values)+';'
    html=html.replace('<script src="/course-golfer.js"></script>','<script>'+ (ROOT/'web/course-golfer.js').read_text()+'</script>')
    html=html.replace('<script src="/course-ui.js" defer></script>','<script>'+seed+'</script><script>'+ (ROOT/'web/course-ui.js').read_text()+'</script>')
    # This standalone preview has no parent analysis page to navigate back to.
    html=html.replace('id="course-return" class="button"','id="course-return" class="button" hidden')
    html=html.replace('id="return-result" href="./"','id="return-result" href="#" hidden')
    Path(out).write_text(html);print(out)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--report-json',required=True);p.add_argument('--out',required=True);p.add_argument('--research-images');a=p.parse_args();build(a.report_json,a.out,a.research_images)
