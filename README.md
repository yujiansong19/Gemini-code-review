
# Gemini CodeLens 本地部署指南

按照以下步骤，在你的本地机器上运行这个 AI 代码审查工具。

## 📦 前置条件

- **Node.js**: 建议版本 18.0 或更高。
- **npm** 或 **pnpm**: 用于管理依赖。
- **Gemini API Key**: 从 [Google AI Studio](https://aistudio.google.com/app/apikey) 获取。

## 🚀 启动步骤

1. **准备代码**:
   创建一个文件夹（如 `gemini-codelens`），将本项目的所有文件放入其中。

2. **安装依赖**:
   在文件夹根目录打开终端，执行：
   ```bash
   npm install
   ```

3. **配置 API Key**:
   在根目录创建一个名为 `.env` 的文件，内容如下：
   ```env
   VITE_API_KEY=你的_GEMINI_API_密钥
   ```

4. **启动开发服务器**:
   ```bash
   npm run dev
   ```

5. **访问应用**:
   终端会输出一个地址（通常是 `http://localhost:5173`），在浏览器打开即可。

## 🛠️ 技术栈说明

- **Vite**: 极速的开发服务器和打包工具。
- **React 19**: 最新的前端框架支持。
- **Tailwind CSS**: 响应式 UI 框架。
- **Gemini 3 Pro**: 驱动深度代码分析的 AI 核心。

## 📝 注意事项

- **网络环境**: 由于使用了 Google Gemini API，确保你的本地网络环境可以访问 Google 服务。
- **环境变量**: 生产环境下，请确保 `VITE_API_KEY` 已正确注入到你的托管平台。
