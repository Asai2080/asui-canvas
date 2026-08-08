@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul || (
  echo [ASUI Canvas] 未检测到 Node.js 18+，请先安装：https://nodejs.org/
  pause
  exit /b 1
)
where npm >nul 2>nul || (
  echo [ASUI Canvas] 未检测到 npm，请重新安装 Node.js。
  pause
  exit /b 1
)

if not exist "node_modules\.bin\next.cmd" (
  echo [ASUI Canvas] 首次启动，正在安装项目依赖...
  call npm ci --no-audit --no-fund || (
    echo [ASUI Canvas] 依赖安装失败。
    pause
    exit /b 1
  )
)

if not exist ".env.local" copy /y ".env.example" ".env.local" >nul

start "" http://localhost:3030/
echo [ASUI Canvas] 项目启动中：http://localhost:3030/
call npm run dev -- --port 3030
pause
