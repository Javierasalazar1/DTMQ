@echo off
echo ========================================================
echo   Descargando Naves desde Google Drive
echo ========================================================
powershell -ExecutionPolicy Bypass -File "%~dp0update_naves.ps1"
