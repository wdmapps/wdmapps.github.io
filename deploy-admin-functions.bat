@echo off
title WDM Apps - Deploy das Functions do Admin
cd /d "%~dp0"

echo.
echo ================================================
echo   WDM APPS - PUBLICAR FUNCTIONS DO ADMIN
echo ================================================
echo.
echo Projeto Firebase: wdm-admin
echo Config: firebase.admin.json
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao foi encontrado.
  echo Instale o Node.js antes de continuar.
  pause
  exit /b 1
)

echo Publicando as funcoes seguras do WDM Criativos e Admin...
echo Se o Firebase pedir login, entre com a conta dona do projeto.
echo.

call npx --yes firebase-tools deploy --project wdm-admin --config firebase.admin.json --only functions

if errorlevel 1 (
  echo.
  echo O deploy terminou com erro. Leia a mensagem acima.
  pause
  exit /b 1
)

echo.
echo ================================================
echo   DEPLOY CONCLUIDO
echo ================================================
echo.
echo Agora abra:
echo https://wdmapps.com.br/admin/criativos/
echo.
pause
