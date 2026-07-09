@echo off
chcp 65001 > nul
echo.
echo  ===================================
echo   Lumique 자동 배포 시작
echo  ===================================
echo.

set /p msg="변경 내용 메모 (빈칸이면 '업데이트'로 저장): "
if "%msg%"=="" set msg=업데이트

git add .
git commit -m "%msg%"
git push

echo.
echo  ===================================
echo   배포 완료! Vercel이 자동으로
echo   1분 내에 사이트를 갱신합니다.
echo  ===================================
pause
