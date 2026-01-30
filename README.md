
# Gemini CodeLens 本地部署指南

按照以下步骤，在你的本地机器上运行这个专业级 AI 代码审查工具。

## 📦 前置条件

- **Node.js**: 建议版本 18.0 或更高。
- **npm**: 用于管理依赖。
- **Gemini API Key**: 必须从 [Google AI Studio](https://aistudio.google.com/app/apikey) 获取。

## 🚀 快速启动

1. **放置文件**: 确保所有项目文件（包括 `src` 结构）已完整放置在文件夹中。
2. **安装依赖**:
   ```bash
   npm install
   ```
3. **配置密钥**:
   在根目录创建 `.env` 文件：
   ```env
   API_KEY=你的_GEMINI_API_KEY_在此
   ```
4. **运行服务**:
   ```bash
   npm run dev
   ```
5. **访问**: 打开浏览器访问 `http://localhost:5173`。

## 🛠️ 技术亮点

- **Gemini 3 Pro**: 开启 `thinkingBudget` 模式，具备深度的逻辑推理能力。
- **工程化审计**: 支持直接上传整个项目文件夹进行全方位扫描。
- **玻璃拟态 UI**: 基于 Tailwind CSS 打造的高级 IDE 质感。

## ⚠️ 注意事项

- **网络环境**: 由于连接 Google Gemini 节点，请确保您的网络环境能够顺畅访问 Google API。
- **隐私说明**: 代码仅在本地浏览器和 Google 官方 API 之间传输，不经过第三方中转。
