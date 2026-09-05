@echo off
title FinControl Pro - Servidor Local
echo Iniciando FinControl Pro...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
