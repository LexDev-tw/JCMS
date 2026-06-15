@echo off
REM Stop JCMS backend (pid file, PM2, port listeners).
setlocal EnableExtensions
cd /d "%~dp0"

set "PORT=3000"
if exist "%~dp0.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0.env") do (
        if /I "%%~A"=="PORT" set "PORT=%%~B"
    )
)

call :EnsureNode
if errorlevel 1 exit /b 1

node "%~dp0scripts\shutdown-jcms.js"
set "EC=%ERRORLEVEL%"
if "%EC%"=="0" (
    echo [OK] JCMS shutdown complete.
) else (
    echo [WARN] JCMS shutdown finished with warnings. See messages above.
    pause
)
exit /b %EC%

:EnsureNode
where node >nul 2>&1
if not errorlevel 1 exit /b 0
if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    exit /b 0
)
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    exit /b 0
)
echo [ERROR] node not found in PATH. Install Node.js 18+ or run Start-JCMS.bat once.
pause
exit /b 1
