@echo off
REM Single entry launcher: ensure Node.js, then call Node supervisor.
setlocal EnableExtensions
cd /d "%~dp0"

set "PORT=3000"
if exist "%~dp0.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0.env") do (
        if /I "%%~A"=="PORT" set "PORT=%%~B"
    )
)
set "APP_URL=http://127.0.0.1:%PORT%/JCMS.html"

call :EnsureNode
if errorlevel 1 exit /b 1

set "JCMS_NO_BROWSER=1"
node "%~dp0scripts\start-jcms.js"
set "EC=%ERRORLEVEL%"
if "%EC%"=="0" (
    echo [OK] JCMS is ready: %APP_URL%
    start "" "%APP_URL%"
) else (
    echo [ERROR] JCMS failed to start. Check messages above.
    pause
)
exit /b %EC%

:EnsureNode
where node >nul 2>&1
if not errorlevel 1 exit /b 0

if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    where node >nul 2>&1
    if not errorlevel 1 exit /b 0
)
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    where node >nul 2>&1
    if not errorlevel 1 exit /b 0
)

echo [JCMS] Node.js not found. Attempting automatic install (Node.js LTS) ...
where winget >nul 2>&1
if not errorlevel 1 (
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    goto :RefreshNodePath
)

where choco >nul 2>&1
if not errorlevel 1 (
    choco install nodejs-lts -y
    goto :RefreshNodePath
)

echo [ERROR] Could not install Node.js automatically.
echo         Install Node.js 18+ LTS manually: https://nodejs.org/
echo         Or enable winget / Chocolatey and run this script again.
pause
exit /b 1

:RefreshNodePath
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"

where node >nul 2>&1
if not errorlevel 1 (
    echo [JCMS] Node.js is ready:
    node -v
    exit /b 0
)

echo [ERROR] Node.js was installed but is not available in this session.
echo         Close this window, open a new Command Prompt, and run Start-JCMS.bat again.
pause
exit /b 1
