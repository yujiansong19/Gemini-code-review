
@echo off
setlocal enabledelayedexpansion

echo [Gemini CodeLens PRO] 正在初始化环境...

:: 检查 .env 文件
if not exist .env (
    echo [INFO] 未找到 .env 文件，正在为您创建模板...
    echo API_KEY=在此输入您的_GEMINI_API_KEY > .env
    echo [WARN] 请先在生成的 .env 文件中填入您的 API Key，然后重新运行此脚本。
    pause
    exit /b
)

:: 检查 node_modules
if not exist node_modules (
    echo [INFO] 正在安装项目依赖，请稍候...
    call npm install
)

echo [SUCCESS] 环境准备就绪，正在启动应用...
npm run dev
pause
