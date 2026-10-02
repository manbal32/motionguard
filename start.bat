@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Python environment missing. See README.md.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" scripts\check_gemini_connection.py
if errorlevel 1 (
  echo Connection check failed. Please share the error types above.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:8502 - do not use the old 8501 tab.
".venv\Scripts\python.exe" -m streamlit run app.py --server.address 127.0.0.1 --server.port 8502 --browser.gatherUsageStats false
pause
