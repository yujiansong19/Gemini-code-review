
export enum Severity {
  CRITICAL = 'Critical',
  WARNING = 'Warning',
  SUGGESTION = 'Suggestion',
  INFO = 'Info'
}

export enum AIProvider {
  GEMINI = 'gemini',
  OPENROUTER = 'openrouter',
  QWEN = 'qwen',
  GLM = 'glm'
}

export enum RemoteProvider {
  GITHUB = 'github',
  BITBUCKET = 'bitbucket'
}

export interface ProjectFile {
  name: string;
  content: string;
}

export interface RemoteConfig {
  provider: RemoteProvider;
  owner: string; // GitHub owner or Bitbucket workspace
  repo: string;
  branch: string;
  token?: string; // GitHub Token
  username?: string; // Bitbucket Username
  password?: string; // Bitbucket App Password
}

export interface ReviewIssue {
  id: string;
  filename: string;
  line?: number;
  severity: Severity;
  category: string;
  title: string;
  description: string;
  suggestion: string;
  codeSnippet?: string;
}

export interface CodeReviewResult {
  summary: string;
  score: number;
  issues: ReviewIssue[];
  improvedCode?: string;
  timestamp?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ModelConfig {
  provider: AIProvider;
  modelId: string;
  baseUrl?: string;
}
