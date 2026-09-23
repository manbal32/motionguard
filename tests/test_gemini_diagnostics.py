import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from google.genai.errors import ClientError
from modules.gemini_analyzer import GeminiAnalyzer
from modules.gemini_diagnostics import error_metadata


class DiagnosticsTests(unittest.TestCase):
    def test_quota_preserves_counts_without_payload_or_key(self):
        key = 'private-test-key'
        exc = ClientError(429, {'error': {'message': key + ' SECRET_COORDINATES', 'details': [
            {'@type': 'type.googleapis.com/google.rpc.QuotaFailure', 'violations': [
                {'quotaMetric': 'generate_content_free_tier_input_token_count',
                 'quotaId': 'InputTokensPerMinute', 'quotaValue': '250000',
                 'description': 'SECRET_COORDINATES'}]},
            {'@type': 'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '30s'}]}})
        client = MagicMock()
        client.models.count_tokens.return_value = SimpleNamespace(total_tokens=1234)
        client.models.generate_content.side_effect = exc
        with tempfile.TemporaryDirectory() as directory, patch('modules.gemini_diagnostics.LOG_PATH', Path(directory)/'requests.jsonl'), patch('google.genai.Client') as factory:
            factory.return_value.__enter__.return_value = client
            result = GeminiAnalyzer(api_key=key, mock=False).analyze([], [{'phase': 'address', 'shoulder_angle': 30}], user_context={'note': 'SECRET_COORDINATES'})
            d = result['api_diagnostics']
            self.assertEqual(d['input_tokens'], 1234)
            self.assertEqual(d['error']['code'], 429)
            self.assertEqual(d['error']['retry_delay'], '30s')
            self.assertIn('AI 해석이 아닙니다', result['summary'])
            log = (Path(directory)/'requests.jsonl').read_text()
            self.assertNotIn(key, log)
            self.assertNotIn('SECRET_COORDINATES', log)
            self.assertEqual(json.loads(log)['outcome'], 'failed')
            client.models.generate_content.assert_called_once()

    def test_count_failure_blocks_generation(self):
        client = MagicMock()
        client.models.count_tokens.side_effect = RuntimeError('count unavailable')
        client.models.generate_content.return_value = SimpleNamespace(text='{"disease_mentions": []}', usage_metadata=SimpleNamespace(prompt_token_count=100, candidates_token_count=20, thoughts_token_count=0, total_token_count=120))
        with patch('modules.gemini_analyzer.save_diagnostics') as save, patch('google.genai.Client') as factory:
            factory.return_value.__enter__.return_value = client
            result = GeminiAnalyzer(api_key='test-key', mock=False).analyze([], [{'phase': 'address', 'shoulder_angle': 30}])
            self.assertEqual(result['api_diagnostics']['outcome'], 'blocked')
            self.assertIn('token_count_error', result['api_diagnostics'])
            client.models.generate_content.assert_not_called()
            save.assert_called_once()

    def test_oversize_blocks_generation(self):
        client = MagicMock()
        client.models.count_tokens.return_value = SimpleNamespace(total_tokens=1076731)
        with patch('modules.gemini_analyzer.save_diagnostics'), patch('google.genai.Client') as factory:
            factory.return_value.__enter__.return_value = client
            result = GeminiAnalyzer(api_key='test-key', mock=False).analyze([], [{'shoulder_angle': 30}])
            self.assertEqual(result['api_diagnostics']['block_reason'], 'input_token_limit')
            client.models.generate_content.assert_not_called()

    def test_mock_never_calls_api_or_logs(self):
        with patch('google.genai.Client') as factory, patch('modules.gemini_analyzer.save_diagnostics') as save:
            result = GeminiAnalyzer(mock=True).analyze([], [{'shoulder_angle': 30}])
            self.assertEqual(result['api_diagnostics'], {})
            factory.assert_not_called()
            save.assert_not_called()

    def test_error_does_not_copy_arbitrary_message(self):
        self.assertEqual(error_metadata(RuntimeError('private input')), {'type': 'RuntimeError'})
