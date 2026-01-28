
import { GoogleGenAI, Type } from "@google/genai";
import { CodeReviewResult, Severity, ProjectFile } from "../types";

export class GeminiService {
  private getClient() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  }

  async reviewProject(files: ProjectFile[]): Promise<CodeReviewResult> {
    const ai = this.getClient();
    const projectContext = files.map(f => `--- FILE: ${f.name} ---\n${f.content}`).join('\n\n');
    
    const prompt = `你是一位世界级的全栈首席架构师，拥有超过15年的复杂系统设计经验。
    请对以下代码工程进行深度评审。
    
    项目背景与代码内容：
    ${projectContext}

    评审核心维度：
    1. **Java & Spring 生态**：检查依赖注入、事务一致性、并发安全、JVM 优化及 Spring Boot 最佳实践。
    2. **Vue.js & 前端工程化**：检查响应式开销、组件通信、内存泄露（事件监听未移除）、状态流管理。
    3. **安全漏洞**：识别 SQL 注入、跨站脚本、越权风险及硬编码密钥。
    4. **架构设计**：评估模块解耦、SOLID 原则及代码可维护性。
    
    输出要求：
    - 使用结构化 JSON 响应。
    - issues 中的 filename 必须精确匹配上传的文件名。
    - 所有描述和建议请使用中文，专业术语可保留英文。`;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 32768 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "工程整体质量总结" },
            score: { type: Type.NUMBER, description: "健康评分 0-100" },
            issues: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  filename: { type: Type.STRING },
                  line: { type: Type.NUMBER },
                  severity: { type: Type.STRING, enum: Object.values(Severity) },
                  category: { type: Type.STRING, description: "分类（如：性能, 安全, 规范）" },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  suggestion: { type: Type.STRING },
                  codeSnippet: { type: Type.STRING, description: "修复示例代码或问题片段" }
                },
                required: ["id", "filename", "severity", "category", "title", "description", "suggestion"]
              }
            },
            improvedCode: { type: Type.STRING, description: "对核心模块的总体优化方案描述" }
          },
          required: ["summary", "score", "issues"]
        }
      }
    });

    try {
      return JSON.parse(response.text || "{}") as CodeReviewResult;
    } catch (e) {
      console.error("Parse Error:", e);
      throw new Error("AI 响应解析失败，请检查工程复杂度并重试。");
    }
  }

  async chatAboutProject(history: { role: 'user' | 'assistant', content: string }[], message: string, files: ProjectFile[]): Promise<string> {
    const ai = this.getClient();
    const context = files.map(f => f.name).join(', ');
    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: `你是一位全栈专家助理，正在协助开发者评审名为 ${context} 的项目。
        请基于文件内容提供精准的技术指导。风格专业、高效、见解深刻。使用中文。`
      }
    });

    // 转换历史记录格式
    const response = await chat.sendMessage({ message });
    return response.text || "通信异常。";
  }
}

export const geminiService = new GeminiService();
