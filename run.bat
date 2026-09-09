@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ========================================
echo          MOSTIK - local launch
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ne najden.
  echo Ustanovite Node.js LTS: https://nodejs.org/
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm ne najden.
  pause
  exit /b 1
)

echo Node:
node --version
echo.

echo Ustanavlivaem zavisimosti (esli nuzhno)...
call npm install
if errorlevel 1 (
  echo Oshibka pri npm install.
  pause
  exit /b 1
)

echo.
echo Zapuskaem Netlify Dev i lokalnuyu bazu...
echo.
start "MOSTIK Netlify Dev" /D "%~dp0" cmd /k npx netlify-cli dev

echo Zhdyom start lokalnoy bazy...
timeout /t 8 /nobreak >nul

echo.
echo Primenyayem migracii bazy...
call npx netlify-cli database migrations apply
if errorlevel 1 (
  echo.
  echo Migracii ne udalos primenit s pervogo raza.
  echo Probuem eshche raz cherez 5 sekund...
  timeout /t 5 /nobreak >nul
  call npx netlify-cli database migrations apply
)

echo.
echo ========================================
echo Baza gotova. Otkroyte: http://localhost:8888
echo Okno Netlify Dev ostavlyayte otkrytym.
echo ========================================
echo.
pause
