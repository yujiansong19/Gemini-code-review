
import React, { useState, useCallback, useRef, useEffect } from 'react';
import Editor from 'react-simple-code-editor';
// @ts-ignore
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markdown';

import { geminiService } from './services/geminiService';
import { Severity, ReviewIssue, CodeReviewResult, ChatMessage, ProjectFile } from './types';
import { Icon } from './components/Icon';

const HighlightingCodeBlock: React.FC<{ code: string; language: string; className?: string }> = ({ code, language, className = "" }) => {
  const langKey = language === 'vue' || language === 'html' ? 'markup' : language;
  const grammar = Prism.languages[langKey] || Prism.languages.javascript;
  const html = Prism.highlight(code, grammar, langKey);
  
  return (
    <pre className={`language-${langKey} ${className} overflow-x-auto`}>
      <code className={`language-${langKey}`} dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
};

const App: React.FC = () => {
  const [mode, setMode] = useState<'single' | 'project'>('project');
  const [singleCode, setSingleCode] = useState<string>('');
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [language, setLanguage] = useState<string>('java');
  const [isReviewing, setIsReviewing] = useState<boolean>(false);
  const [reviewResult, setReviewResult] = useState<CodeReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<ReviewIssue | null>(null);
  
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatting, setIsChatting] = useState<boolean>(false);
  const [showChat, setShowChat] = useState<boolean>(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showChat) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, showChat]);

  const processFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      const path = (file as any).webkitRelativePath || file.name;
      const ignore = ['node_modules', '.git', 'dist', 'target', '.idea', '.vscode', 'build'];
      if (ignore.some(p => path.includes(p)) || file.size > 500000) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setProjectFiles(prev => [...prev.filter(f => f.name !== path), { name: path, content }]);
      };
      reader.readAsText(file);
    });
  };

  const handleReview = async () => {
    const files = mode === 'single' ? [{ name: 'snippet.' + language, content: singleCode }] : projectFiles;
    if (files.length === 0) return;

    setIsReviewing(true);
    setError(null);
    setReviewResult(null);
    setSelectedIssue(null);
    
    try {
      const result = await geminiService.reviewProject(files);
      setReviewResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsReviewing(false);
    }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatting) return;

    const userMsg: ChatMessage = { role: 'user', content: chatInput, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatting(true);

    try {
      const res = await geminiService.chatAboutProject(chatMessages, chatInput, projectFiles);
      setChatMessages(prev => [...prev, { role: 'assistant', content: res, timestamp: new Date() }]);
    } catch {
      setError("AI 专家暂时离开。");
    } finally {
      setIsChatting(false);
    }
  };

  const getSeverityStyles = (sev: Severity) => {
    switch (sev) {
      case Severity.CRITICAL: return 'bg-red-500/10 text-red-400 border-red-500/20';
      case Severity.WARNING: return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case Severity.SUGGESTION: return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#0b0f1a] text-slate-300 font-inter selection:bg-emerald-500/30">
      {/* Top Navbar */}
      <nav className="h-14 border-b border-slate-800/60 bg-[#0f172a]/80 backdrop-blur-xl flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-lg shadow-lg shadow-emerald-500/20">
            <Icon name="code" className="text-white" size={18} />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">Gemini <span className="text-emerald-400">CodeLens</span></span>
          <div className="h-4 w-px bg-slate-800 mx-2"></div>
          <div className="flex bg-slate-900/50 p-1 rounded-lg border border-slate-800">
            <button onClick={() => setMode('project')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${mode === 'project' ? 'bg-slate-800 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>工程</button>
            <button onClick={() => setMode('single')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${mode === 'single' ? 'bg-slate-800 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>快查</button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={handleReview}
            disabled={isReviewing}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-900/20"
          >
            {isReviewing ? <Icon name="refresh" className="animate-spin" size={16}/> : <Icon name="zap" size={16}/>}
            {isReviewing ? "分析中..." : "启动评审"}
          </button>
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        {/* Left: Project Explorer or Editor */}
        <aside className="w-1/4 border-r border-slate-800/60 bg-[#0f172a]/30 flex flex-col">
          {mode === 'project' ? (
            <div className="flex flex-col h-full">
              <div className="p-4 flex items-center justify-between border-b border-slate-800/40">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">资源管理器</span>
                <button onClick={() => folderInputRef.current?.click()} className="p-1 hover:bg-slate-800 rounded transition-colors text-emerald-500">
                  <Icon name="copy" size={14}/>
                </button>
                <input type="file" ref={folderInputRef} // @ts-ignore
                webkitdirectory="true" directory="" className="hidden" onChange={(e) => processFiles(e.target.files)} />
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {projectFiles.length === 0 ? (
                  <div className="h-40 flex flex-col items-center justify-center text-center p-6 opacity-30">
                    <Icon name="eye" size={24} className="mb-2"/>
                    <p className="text-[10px]">点击上方图标上传 Java/Vue 工程文件夹</p>
                  </div>
                ) : projectFiles.map(f => (
                  <div key={f.name} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-800/50 rounded group cursor-default">
                    <span className={`w-1 h-1 rounded-full ${f.name.endsWith('.java') ? 'bg-red-400' : f.name.endsWith('.vue') ? 'bg-emerald-400' : 'bg-blue-400'}`}></span>
                    <span className="truncate flex-1">{f.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full p-4 gap-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">代码片段</span>
              <select value={language} onChange={e => setLanguage(e.target.value)} className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs outline-none">
                <option value="java">Java</option>
                <option value="vue">Vue</option>
                <option value="typescript">TypeScript</option>
              </select>
              <div className="flex-1 border border-slate-800 rounded-lg overflow-hidden bg-slate-950/50">
                <Editor
                  value={singleCode}
                  onValueChange={c => setSingleCode(c)}
                  highlight={c => Prism.highlight(c, Prism.languages[language] || Prism.languages.javascript, language)}
                  padding={12}
                  className="font-fira text-xs"
                  placeholder="在此粘贴代码进行即时诊断..."
                />
              </div>
            </div>
          )}
        </aside>

        {/* Center: Report & Details */}
        <section className="flex-1 flex flex-col bg-[#0b0f1a] overflow-hidden">
          {!reviewResult && !isReviewing ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="w-24 h-24 bg-slate-900/50 rounded-3xl flex items-center justify-center mb-8 border border-slate-800 border-dashed animate-pulse">
                <Icon name="shield" size={40} className="text-slate-700"/>
              </div>
              <h2 className="text-xl font-bold text-white mb-3">准备就绪，等待扫描</h2>
              <p className="text-slate-500 max-w-sm text-sm">上传工程或粘贴代码，AI 专家将立即开始深度性能分析与安全审计。</p>
            </div>
          ) : isReviewing ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-6">
              <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
              <div className="text-center">
                <p className="text-emerald-400 font-bold animate-pulse text-lg">专家正在深度审查逻辑中...</p>
                <p className="text-slate-600 text-xs mt-2 italic">正在应用 Spring 事务模型与 Vue 响应式原理进行比对</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Summary Header */}
              <div className="p-8 border-b border-slate-800/40 bg-gradient-to-r from-slate-900/20 to-transparent">
                <div className="flex justify-between items-start">
                  <div className="max-w-2xl">
                    <h2 className="text-2xl font-black text-white mb-3 flex items-center gap-3">
                      工程审计报告
                      <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">v3.0 PRO</span>
                    </h2>
                    <p className="text-slate-400 text-sm leading-relaxed border-l-2 border-emerald-500/50 pl-4">{reviewResult.summary}</p>
                  </div>
                  <div className="flex flex-col items-center p-4 bg-slate-900/80 rounded-2xl border border-slate-800 shadow-xl">
                    <span className={`text-4xl font-black ${reviewResult.score >= 80 ? 'text-emerald-400' : reviewResult.score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                      {reviewResult.score}
                    </span>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter mt-1">综合质量评分</span>
                  </div>
                </div>
              </div>

              {/* Main Content Areas */}
              <div className="flex-1 flex overflow-hidden p-6 gap-6">
                {/* Issues List */}
                <div className="w-1/2 flex flex-col gap-3 overflow-y-auto pr-2">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">检测到 {reviewResult.issues.length} 处异常</span>
                  {reviewResult.issues.map(issue => (
                    <button 
                      key={issue.id}
                      onClick={() => setSelectedIssue(issue)}
                      className={`text-left p-4 rounded-xl border transition-all ${selectedIssue?.id === issue.id ? 'bg-slate-800/80 border-emerald-500/50 ring-1 ring-emerald-500/20' : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${getSeverityStyles(issue.severity as Severity)}`}>
                          {issue.severity}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono truncate ml-4 opacity-60">
                          {issue.filename.split('/').pop()}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-200 truncate">{issue.title}</h4>
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{issue.description}</p>
                    </button>
                  ))}
                </div>

                {/* Selected Issue Detail */}
                <div className="w-1/2 bg-slate-900/30 rounded-2xl border border-slate-800/60 overflow-hidden flex flex-col">
                  {selectedIssue ? (
                    <div className="flex flex-col h-full animate-in fade-in duration-300">
                      <div className="p-6 border-b border-slate-800/40">
                        <div className="flex items-center gap-2 text-indigo-400 text-[10px] font-black uppercase mb-3">
                          <Icon name="alert" size={14}/>
                          {selectedIssue.category}
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">{selectedIssue.title}</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">{selectedIssue.description}</p>
                      </div>
                      <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                          <h4 className="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-2">
                            <Icon name="check" size={14}/> 建议解决方案
                          </h4>
                          <p className="text-xs text-slate-300 leading-relaxed">{selectedIssue.suggestion}</p>
                        </div>
                        {selectedIssue.codeSnippet && (
                          <div className="rounded-xl overflow-hidden border border-slate-800">
                            <div className="bg-slate-800/50 px-4 py-1.5 flex justify-between items-center">
                              <span className="text-[10px] text-slate-500 font-mono">FIX_EXAMPLE</span>
                            </div>
                            <HighlightingCodeBlock 
                              code={selectedIssue.codeSnippet} 
                              language={selectedIssue.filename.split('.').pop() || 'typescript'} 
                              className="!bg-[#050505] !p-5 !text-[11px]"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600 opacity-40">
                      <Icon name="eye" size={32} className="mb-4"/>
                      <p className="text-xs">选择左侧问题查看详细诊断与修复建议</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Floating Chat Assistant */}
      <div className={`fixed bottom-6 right-6 w-96 flex flex-col transition-all duration-300 z-[100] ${showChat ? 'h-[500px] opacity-100 translate-y-0' : 'h-12 opacity-90 translate-y-2'}`}>
        <div 
          onClick={() => !showChat && setShowChat(true)}
          className={`flex items-center justify-between px-5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-t-2xl shadow-2xl cursor-pointer ${!showChat ? 'rounded-b-2xl h-12' : 'h-14'}`}
        >
          <div className="flex items-center gap-3">
            <Icon name="send" size={18}/>
            <span className="text-sm font-bold">全栈架构师随诊</span>
          </div>
          {showChat && (
            <button onClick={(e) => { e.stopPropagation(); setShowChat(false); }} className="hover:rotate-90 transition-transform">
              <Icon name="refresh" size={16}/>
            </button>
          )}
        </div>
        
        {showChat && (
          <div className="flex-1 bg-slate-900 border-x border-b border-slate-800 flex flex-col overflow-hidden rounded-b-2xl shadow-2xl shadow-black/50">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.length === 0 && (
                <div className="text-center mt-10">
                  <p className="text-[11px] text-slate-500 px-6 italic">“你可以追问关于并发模型、事务传播行为或 Vue 3 自定义 Hooks 的具体实现细节。”</p>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-300 rounded-bl-none border border-slate-700'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef}/>
            </div>
            <form onSubmit={handleChat} className="p-3 bg-slate-950/50 border-t border-slate-800 flex gap-2">
              <input 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="在此输入您的疑问..."
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
              <button disabled={isChatting || !chatInput.trim()} className="p-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-colors disabled:opacity-50">
                <Icon name="send" size={16}/>
              </button>
            </form>
          </div>
        )}
      </div>

      {error && (
        <div className="fixed top-20 right-6 bg-red-500 text-white px-6 py-3 rounded-xl shadow-2xl z-[200] animate-in slide-in-from-right">
          <div className="flex items-center gap-3">
            <Icon name="alert" size={18}/>
            <span className="text-sm font-bold">{error}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
