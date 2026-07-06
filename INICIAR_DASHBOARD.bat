@echo off
echo Iniciando Servidor Local para el Dashboard...
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
