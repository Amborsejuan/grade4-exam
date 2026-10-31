@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

echo ==================================================================
echo  [*] Publishing latest exam system to 24/7 Cloud URL:
echo      https://amborsejuan.github.io/grade4-exam/
echo ==================================================================

git add index.html app.js scope.js question_bank.js question_bank_extra.js question_bank_v2.js question_bank_melances.js server.py start_tablet_exam.bat open_directly.bat deploy_cloud.bat .gitignore
git commit -m "Update Grade 4 exam questions and settings"
git push origin main

echo ==================================================================
echo  [OK] Cloud update pushed! Live URL (updates in ~30-60 seconds):
echo       https://amborsejuan.github.io/grade4-exam/
echo ==================================================================
pause
