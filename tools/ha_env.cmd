@echo off
rem Load HA_URL/HA_TOKEN from the shared NAS secret file (single source for both PCs), then run args.
for /f "usebackq eol=# tokens=1,* delims==" %%a in ("\\100.103.51.128\champ\ha-secrets\ha.env") do set "%%a=%%b"
if "%~1"=="" exit /b 0
%*
