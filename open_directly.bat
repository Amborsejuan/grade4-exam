@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
set PYTHONIOENCODING=utf-8

netstat -aon | findstr ":8080 " | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    start "ExamServer" /min python server.py
    timeout /t 2 /nobreak >nul
    start "" "http://localhost:8080"
) else (
    start "" "http://localhost:8080"
)
