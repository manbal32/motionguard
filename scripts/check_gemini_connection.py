"""Check API access from the same shell that will launch Streamlit."""
from pathlib import Path
import os
import sys
from dotenv import load_dotenv
from google import genai
from google.genai import types

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env', override=True)
try:
    with genai.Client(api_key=os.environ['GEMINI_API_KEY'], http_options=types.HttpOptions(
            timeout=15000, retry_options=types.HttpRetryOptions(attempts=1))) as client:
        result = client.models.count_tokens(model=os.getenv('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
                                            contents='Connection test')
    print(f'Gemini connection OK. Token count: {result.total_tokens}', flush=True)
except Exception as exc:
    print('Gemini connection FAILED. No video or coordinates were sent.', flush=True)
    seen = set()
    while exc is not None and id(exc) not in seen:
        seen.add(id(exc))
        print(type(exc).__name__, 'code=', getattr(exc, 'code', None),
              'errno=', getattr(exc, 'errno', None), flush=True)
        exc = exc.__cause__ or exc.__context__
    sys.exit(1)
