@echo off
rem Load HA_URL/HA_TOKEN from the shared NAS secret file (single source for both PCs), then run args.
set "HA_SECRETS=\\100.103.51.128\champ\ha-secrets\ha.env"
if exist "%HA_SECRETS%" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%HA_SECRETS%") do set "%%a=%%b"
) else (
  rem SSH key logon (e.g. Termius) has no SMB credentials: read the same file over SSH.
  for /f "usebackq eol=# tokens=1,* delims==" %%a in (`C:\Windows\System32\OpenSSH\ssh.exe -n -o BatchMode^=yes -o StrictHostKeyChecking^=accept-new -o ConnectTimeout^=8 drydream@100.103.51.128 "cat /volume1/champ/ha-secrets/ha.env"`) do set "%%a=%%b"
)
rem SSH session: Windows blocks uv's minor-version junction (cpython-3.13-...) with os error 448,
rem so point uv at the real versioned dir (cpython-3.13.N-...) instead.
if defined SSH_CONNECTION for /d %%d in ("%APPDATA%\uv\python\cpython-3.13.*-windows-x86_64-none") do set "UV_PYTHON=%%~nxd"
if "%~1"=="" exit /b 0
%*
