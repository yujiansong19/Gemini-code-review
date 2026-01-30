
import { GoogleGenAI, Type } from "@google/genai";
import { CodeReviewResult, Severity, ProjectFile, AIProvider, ModelConfig } from "../types";

export class GeminiService {
  // Always create a new instance before making an API call per guidelines
  private createAIInstance() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  private async callOpenAICompatible(config: ModelConfig, prompt: string, isJson: boolean = false): Promise<string> {
    const defaultEndpoints: Record<string, string> = {
      [AIProvider.OPENROUTER]: "https://openrouter.ai/api/v1/chat/completions",
      [AIProvider.QWEN]: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      [AIProvider.GLM]: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    };

    // Prioritize custom baseUrl if provided in config
    const baseUrl = config.baseUrl || defaultEndpoints[config.provider];
    if (!baseUrl) throw new Error(`未提供供应商 ${config.provider} 的 Base URL，且无默认配置。`);

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.API_KEY}`,
      },
      body: JSON.stringify({
        model: config.modelId,
        messages: [{ role: "user", content: prompt }],
        response_format: isJson ? { type: "json_object" } : undefined,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } }));
      throw new Error(err.error?.message || `API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async reviewProject(files: ProjectFile[], config: ModelConfig): Promise<CodeReviewResult> {
    const projectContext = files.map(f => `--- FILE: ${f.name} ---\n${f.content}`).join('\n\n');
    
    const prompt = `你是一位世界级的全栈首席架构师，精通《阿里巴巴Java开发手册》与高性能 SQL 审计。
    请深度评审以下工程代码。
    
    评审核心准则：
    1. **阿里规约 (P3C)**：强制检查 POJO 命名、线程池规范、并发安全、Vue 命名与 Prop 校验。
    2. **数据库优化**：检查 DDL 规范、严禁 SELECT *、检查 SQL 索引覆盖度。
    3. **行级调整**：必须指出具体哪个文件、哪一行代码需要调整，并给出修正后的代码片段。

    输出 JSON 格式，必须包含 issues 数组。
    每个 issue 必须包含: id, filename, line (必须是数字), severity, category, title, description, suggestion, codeSnippet.

    代码内容：
    ${projectContext}`;

    if (config.provider === AIProvider.GEMINI) {
      const ai = this.createAIInstance();
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingBudget: 32768 },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              score: { type: Type.NUMBER },
              issues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    filename: { type: Type.STRING },
                    line: { type: Type.INTEGER },
                    severity: { type: Type.STRING },
                    category: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    suggestion: { type: Type.STRING },
                    codeSnippet: { type: Type.STRING }
                  },
                  required: ["id", "filename", "line", "severity", "category", "title", "description", "suggestion"]
                }
              }
            },
            required: ["summary", "score", "issues"]
          }
        }
      });
      return JSON.parse(response.text || "{}");
    } else {
      const text = await this.callOpenAICompatible(config, prompt, true);
      const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(jsonStr);
    }
  }
}

export const geminiService = new GeminiService();
