import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from scripts.test_gemini_api import run_batch
from modules.gemini_analyzer import GeminiAnalyzer


class BatchTests(unittest.TestCase):
    def test_quota_stops_and_preserves_first_result(self):
        analyzer = Mock(model='test-model')
        analyzer.analyze.side_effect = [{'mode': 'real_gemini'}, RuntimeError('429 RESOURCE_EXHAUSTED')]
        with tempfile.TemporaryDirectory() as directory, patch('scripts.test_gemini_api.extract_angles', return_value=([{'phase': 'test'}]*4, 20)) as extract:
            output = Path(directory)
            self.assertEqual(run_batch([Path(f'golf{i}.MP4') for i in range(1,6)], output, analyzer), 2)
            self.assertEqual(extract.call_count, 2)
            self.assertTrue((output/'golf1.json').exists())
            self.assertFalse((output/'golf2.json').exists())
            progress = json.loads((output/'progress.json').read_text(encoding='utf-8'))
            self.assertEqual(progress['completed'], ['golf1.MP4'])
            self.assertEqual(len(progress['remaining']), 4)

    def test_all_five_saved_in_order(self):
        analyzer = Mock(model='test-model')
        analyzer.analyze.return_value = {'mode': 'real_gemini'}
        with tempfile.TemporaryDirectory() as directory, patch('scripts.test_gemini_api.extract_angles', return_value=([{}]*4, 20)) as extract:
            output = Path(directory)
            paths = [Path(f'golf{i}.MP4') for i in range(1,6)]
            self.assertEqual(run_batch(paths, output, analyzer), 0)
            self.assertEqual([c.args[0] for c in extract.call_args_list], paths)
            self.assertEqual(len(list(output.glob('golf*.json'))), 5)

    def test_strict_errors_propagate(self):
        analyzer = GeminiAnalyzer(mock=False, strict_errors=True)
        with patch.object(analyzer, '_real_gemini_analysis', side_effect=RuntimeError('quota')):
            with self.assertRaisesRegex(RuntimeError, 'quota'):
                analyzer.analyze([], [{'phase': 'address', 'shoulder_angle': 30}])

    def test_insufficient_is_not_api_success(self):
        analyzer = Mock(model='test-model')
        analyzer.analyze.return_value = {'mode': 'insufficient_data'}
        with tempfile.TemporaryDirectory() as directory, patch('scripts.test_gemini_api.extract_angles', return_value=([{}]*4, 20)):
            output = Path(directory)
            run_batch([Path('golf1.MP4')], output, analyzer)
            progress = json.loads((output/'progress.json').read_text(encoding='utf-8'))
            self.assertEqual(progress['completed'], [])
            self.assertEqual(progress['insufficient_data'], ['golf1.MP4'])
