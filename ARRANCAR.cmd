@echo off
setlocal
cd /d "%~dp0"
title Mi Segundo Cerebro

rem ---------------------------------------------------------------
rem  Doble clic aqui y ya.
rem
rem  Existe por el problema del huevo y la gallina: el asistente de
rem  configuracion instala Docker, cloudflared y ffmpeg, pero el
rem  asistente corre en Node, asi que Node no puede instalarse a si
rem  mismo. Esto es lo unico que hace falta que alguien ejecute.
rem ---------------------------------------------------------------

echo.
echo   Mi Segundo Cerebro
echo   ==================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   No tienes Node.js, que es donde corre la asistente.
  echo   Lo instalo ahora. Tarda unos minutos.
  echo.
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  echo.
  echo   ------------------------------------------------------------
  echo   Node instalado. CIERRA esta ventana y vuelve a abrir
  echo   ARRANCAR.cmd: Windows necesita reabrir la consola para
  echo   encontrarlo.
  echo   ------------------------------------------------------------
  echo.
  pause
  exit /b 0
)

if not exist "node_modules" (
  echo   Preparando por primera vez. Esto tarda un par de minutos...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   Algo fallo preparando. Copia lo de arriba y mandaselo a Jose.
    pause
    exit /b 1
  )
  echo.
)

echo   ------------------------------------------------------------
echo    NO CIERRES ESTA VENTANA.
echo    Mientras este abierta, la asistente esta despierta.
echo    Si la cierras, se apaga: deja de leer correo y de contestar
echo    por Telegram. Puedes minimizarla sin problema.
echo   ------------------------------------------------------------
echo.

:bucle
echo   Arrancando...
echo.
call npm start
set CODIGO=%errorlevel%

rem  7 = el asistente pidio reiniciarse para aplicar la configuracion.
if "%CODIGO%"=="7" (
  echo.
  echo   Reiniciando para aplicar lo que configuraste...
  echo.
  goto bucle
)

rem  Cualquier otro fallo: vuelve a intentarlo. Un servidor que se muere
rem  por un error de red a las 3 de la manana y espera a que alguien lo
rem  vea no es un servidor.
if not "%CODIGO%"=="0" (
  echo.
  echo   Se cayo con codigo %CODIGO%. Lo vuelvo a intentar en 15 segundos.
  echo   Para pararlo del todo: cierra esta ventana.
  timeout /t 15 /nobreak >nul
  goto bucle
)

echo.
echo   La asistente se cerro sola. Copia lo de arriba y mandaselo a Jose.
pause
