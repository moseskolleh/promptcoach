@echo off
echo ================================
echo CHECKING ECOPROMPT COACH EXTENSION FILES
echo ================================
echo.

if exist manifest.json (
    echo [OK] manifest.json found
) else (
    echo [ERROR] manifest.json NOT FOUND
    echo You are in the WRONG folder!
    echo Navigate to the folder containing manifest.json
    goto :end
)

if exist popup.html (
    echo [OK] popup.html found
) else (
    echo [ERROR] popup.html missing
)

if exist background.js (
    echo [OK] background.js found
) else (
    echo [ERROR] background.js missing
)

if exist content.js (
    echo [OK] content.js found
) else (
    echo [ERROR] content.js missing
)

if exist assets\icon16.png (
    echo [OK] assets\icon16.png found
) else (
    echo [ERROR] assets\icon16.png missing
)

if exist assets\icon48.png (
    echo [OK] assets\icon48.png found
) else (
    echo [ERROR] assets\icon48.png missing
)

if exist assets\icon128.png (
    echo [OK] assets\icon128.png found
) else (
    echo [ERROR] assets\icon128.png missing
)

echo.
echo ================================
echo If all files show [OK], this is the CORRECT folder to load in Chrome
echo In Chrome: go to chrome://extensions/
echo Turn on Developer mode, click Load unpacked
echo Select THIS folder (the one containing these files)
echo ================================

:end
pause
