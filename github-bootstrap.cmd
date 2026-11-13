@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title Blog Insight - GitHub Pages Auto Deploy

rem ===== EASY SETTINGS (edit these only if you wish) =====
set "REPO_NAME=blog-insight"
set "REPO_OWNER="
set "REPO_VISIBILITY=public"
set "REPO_DESCRIPTION=Personal Naver blog keyword insight dashboard"
set "AUTO_INSTALL_TOOLS=1"
set "CREATE_VERSION_TAG=1"
rem ====================================================

echo.
echo  ===================================================
echo   Blog Insight - GitHub Pages One-Click Publisher
 echo  ===================================================
echo.
where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Windows PowerShell 5.1 or newer is required.
  echo          Install PowerShell and run this CMD again.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\github-bootstrap.ps1" -RepoName "%REPO_NAME%" -RepoOwner "%REPO_OWNER%" -Visibility "%REPO_VISIBILITY%" -Description "%REPO_DESCRIPTION%" -AutoInstallTools "%AUTO_INSTALL_TOOLS%" -CreateVersionTag "%CREATE_VERSION_TAG%"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo [OK] Completed. Run this CMD again for updates.
) else (
  echo [ERROR] Publishing did not finish. Review the message above.
)
echo.
pause
exit /b %RESULT%
