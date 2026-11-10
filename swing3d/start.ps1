$ErrorActionPreference = 'Stop'
py -3 "$PSScriptRoot/server.py"
exit $LASTEXITCODE
