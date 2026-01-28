
export enum Severity {
  CRITICAL = 'Critical',
  WARNING = 'Warning',
  SUGGESTION = 'Suggestion',
  INFO = 'Info'
}

export interface ProjectFile {
  name: string;
  content: string;
}

export interface ReviewIssue {
  id: string;
  filename: string; // 新增：标识问题所属文件
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
  improvedCode?: string; // 对于工程评审，这可能是建议的架构重构描述或核心文件优化
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ReviewSession {
  id: string;
  timestamp: Date;
  files: ProjectFile[];
  result?: CodeReviewResult;
}
