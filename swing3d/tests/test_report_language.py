import json
from unittest import TestCase
import coach

class ReportLanguageTests(TestCase):
    def test_report_language(self):
        def item(i, gap, severity='low'):
            return dict(id=str(i), phase='top',channel='swing',measured=24+gap,reference=24,difference=gap,severity=severity,drill='천천히 반복하세요.',youtube=['골프 백스윙 연습'])
        report=coach.customer_report(dict(concern='백스윙이 어렵습니다.',goal='매일 연습'),[item(0,0),item(1,9),item(2,18,'medium'),item(3,25,'high'),item(4,30,'high')],[item(0,0),item(5,2)])
        body=json.dumps(report,ensure_ascii=False)
        for forbidden in ('신뢰도','프레임','정규화','채널'):self.assertNotIn(forbidden,body)
        self.assertEqual([i['id'] for i in report['improvements']],['4','3','2'])
        self.assertNotIn('0',[i['id'] for i in report['improvements']+report['positives']])
        self.assertEqual(report['concern'],'백스윙이 어렵습니다.')
        self.assertIn('백스윙',report['answer'])
        self.assertTrue(1<=len(report['positives'])<=2)
