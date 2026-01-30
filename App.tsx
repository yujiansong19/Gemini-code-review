
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
import 'prismjs/components/prism-sql';

import { geminiService } from './services/geminiService';
import { Severity, ReviewIssue, CodeReviewResult, ChatMessage, ProjectFile, AIProvider, ModelConfig, RemoteConfig, RemoteProvider } from './types';
import { Icon } from './components/Icon';

const PRESET_MODELS: Record<string, ModelConfig> = {
  "gemini-pro": { provider: AIProvider.GEMINI, modelId: "gemini-3-pro-preview" },
  "openrouter": { provider: AIProvider.OPENROUTER, modelId: "anthropic/claude-3.5-sonnet" },
  "qwen": { provider: AIProvider.QWEN, modelId: "qwen-max" },
  "glm": { provider: AIProvider.GLM, modelId: "glm-4" }
};

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
  const [mode, setMode] = useState<'single' | 'project' | 'remote'>('project');
  const [currentModelKey, setCurrentModelKey] = useState<string>("gemini-pro");
  const [customBaseUrl, setCustomBaseUrl] = useState<string>("");
  
  // Local Project States
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [pastedCode, setPastedCode] = useState<string>("");
  const [pastedFileName, setPastedFileName] = useState<string>("App.java");

  // Remote Config States
  const [remoteConfig, setRemoteConfig] = useState<RemoteConfig>({ 
    provider: RemoteProvider.GITHUB, 
    owner: '', 
    repo: '', 
    branch: 'main' 
  });
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [remoteFiles, setRemoteFiles] = useState<ProjectFile[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const [isReviewing, setIsReviewing] = useState<boolean>(false);
  const [reviewResult, setReviewResult] = useState<CodeReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<ReviewIssue | null>(null);
  
  const hasConfigKey = !!process.env.API_KEY && process.env.API_KEY !== 'undefined';
  const folderInputRef = useRef<HTMLInputElement>(null);

  const selectedModelConfig = PRESET_MODELS[currentModelKey];
  const isCustomizableProvider = selectedModelConfig.provider !== AIProvider.GEMINI;

  const fetchBitbucketFiles = async (workspace: string, repo: string, branch: string, authHeader: string) => {
    const relevantExtensions = ['.java', '.vue', '.sql', '.ts', '.js', '.tsx', '.jsx'];
    const loaded: ProjectFile[] = [];

    const fetchLevel = async (path: string = "") => {
      const url = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/src/${branch}/${path}`;
      const res = await fetch(url, { headers: { 'Authorization': authHeader } });
      if (!res.ok) throw new Error(`Bitbucket 访问失败: ${res.status}`);
      
      const data = await res.json();
      for (const entry of data.values) {
        if (entry.type === 'commit_directory') {
          await fetchLevel(entry.path);
        } else if (entry.type === 'commit_file') {
          if (relevantExtensions.some(ext => entry.path.endsWith(ext)) && loaded.length < 30) {
            const contentRes = await fetch(entry.links.self.href, { headers: { 'Authorization': authHeader } });
            const content = await contentRes.text();
            loaded.push({ name: entry.path, content });
          }
        }
      }
    };

    await fetchLevel();
    return loaded;
  };

  const fetchRemoteFiles = async () => {
    if (!remoteConfig.owner || !remoteConfig.repo) {
      setError("请完整输入工程路径（所有者/项目名）。");
      return;
    }

    setIsSyncing(true);
    setError(null);
    try {
      if (remoteConfig.provider === RemoteProvider.GITHUB) {
        const headers: HeadersInit = remoteConfig.token ? { 'Authorization': `token ${remoteConfig.token}` } : {};
        const url = `https://api.github.com/repos/${remoteConfig.owner}/${remoteConfig.repo}/git/trees/${remoteConfig.branch}?recursive=1`;
        
        const treeRes = await fetch(url, { headers });
        if (!treeRes.ok) throw new Error("无法连接 GitHub。请检查路径或访问令牌。");
        
        const treeData = await treeRes.json();
        const relevantExtensions = ['.java', '.vue', '.sql', '.ts', '.js', '.tsx', '.jsx'];
        
        const blobs = treeData.tree.filter((node: any) => 
          node.type === 'blob' && 
          relevantExtensions.some(ext => node.path.endsWith(ext)) &&
          !node.path.includes('node_modules/')
        ).slice(0, 30);

        const loaded: ProjectFile[] = [];
        for (const node of blobs) {
          const fileRes = await fetch(node.url, { headers });
          const fileData = await fileRes.json();
          const content = atob(fileData.content.replace(/\n/g, ''));
          loaded.push({ name: node.path, content });
        }
        setRemoteFiles(loaded);
      } else {
        if (!remoteConfig.username || !remoteConfig.password) {
          throw new Error("Bitbucket 私有库审计需要用户名和应用密码。");
        }
        const auth = btoa(`${remoteConfig.username}:${remoteConfig.password}`);
        const loaded = await fetchBitbucketFiles(remoteConfig.owner, remoteConfig.repo, remoteConfig.branch, `Basic ${auth}`);
        setRemoteFiles(loaded);
      }

      setLastSyncTime(new Date().toLocaleTimeString());
      setMode('remote');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const processLocalFolder = (files: FileList | null) => {
    if (!files) return;
    setProjectFiles([]);
    Array.from(files).forEach(file => {
      const path = (file as any).webkitRelativePath || file.name;
      if (file.size > 1024 * 500) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setProjectFiles(prev => [...prev, { name: path, content }]);
      };
      reader.readAsText(file);
    });
    setMode('project');
  };

  const handleReview = async () => {
    if (!hasConfigKey) {
      setError("未检测到 API 密钥。请确保启动脚本已正确配置环境变量。");
      return;
    }
    
    let files: ProjectFile[] = [];
    if (mode === 'project') files = projectFiles;
    else if (mode === 'remote') files = remoteFiles;
    else if (mode === 'single') files = [{ name: pastedFileName, content: pastedCode }];

    if (files.length === 0 || (mode === 'single' && !pastedCode.trim())) {
      setError("无可审计的代码。请同步远程仓库、上传本地文件夹或粘贴代码片段。");
      return;
    }

    setIsReviewing(true);
    setError(null);
    setReviewResult(null);
    setSelectedIssue(null);
    
    try {
      const configWithBaseUrl = {
        ...selectedModelConfig,
        baseUrl: customBaseUrl.trim() || undefined
      };
      const result = await geminiService.reviewProject(files, configWithBaseUrl);
      setReviewResult({ ...result, timestamp: new Date().toLocaleTimeString() });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsReviewing(false);
    }
  };

  const getLanguage = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'java') return 'java';
    if (ext === 'sql') return 'sql';
    if (ext === 'vue' || ext === 'html') return 'markup';
    return 'typescript';
  };

  return (
    <div className="h-screen flex flex-col bg-[#0b0f1a] text-slate-300 font-inter selection:bg-emerald-500/30 overflow-hidden">
      {/* Navbar */}
      <nav className="h-16 border-b border-slate-800/60 bg-[#0f172a]/80 backdrop-blur-xl flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-5">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
            <Icon name="shield" className="text-white" size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-black tracking-tight text-white uppercase italic">Gemini CodeLens <span className="text-indigo-400">PRO</span></span>
            <span className="text-[9px] font-bold text-slate-500 tracking-[0.2em]">MULTI-CLOUD AUDITOR</span>
          </div>
          
          <div className="h-6 w-px bg-slate-800 mx-1"></div>
          
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold shadow-sm transition-all ${hasConfigKey ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400' : 'border-red-500/30 bg-red-500/5 text-red-400'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${hasConfigKey ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
            {hasConfigKey ? "核心引擎就绪" : "等待密钥配置"}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <select 
              value={currentModelKey}
              onChange={(e) => setCurrentModelKey(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-[11px] font-bold px-3 py-1.5 rounded-lg outline-none text-slate-400 focus:border-indigo-500/50"
            >
              <option value="gemini-pro">Gemini 3 Pro (阿里规约深度审计)</option>
              <option value="openrouter">Claude 3.5 (OpenRouter)</option>
              <option value="qwen">通义千问 (Qwen)</option>
              <option value="glm">智谱 AI (GLM)</option>
            </select>

            {isCustomizableProvider && (
              <div className="flex items-center gap-2 group">
                <Icon name="settings" size={14} className="text-slate-500" />
                <input 
                  type="text"
                  placeholder="Base URL"
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-[10px] px-3 py-1.5 rounded-lg outline-none text-slate-300 w-40 focus:border-indigo-500/50"
                />
              </div>
            )}
          </div>

          <div className="flex bg-slate-900/80 p-1.5 rounded-xl border border-slate-800">
            <button onClick={() => setMode('project')} className={`px-4 py-1 text-[11px] font-bold rounded-lg transition-all ${mode === 'project' || mode === 'single' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>本地模式</button>
            <button onClick={() => setMode('remote')} className={`px-4 py-1 text-[11px] font-bold rounded-lg transition-all ${mode === 'remote' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>远程同步</button>
          </div>
          
          <button 
            onClick={handleReview}
            disabled={isReviewing}
            className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-xl shadow-emerald-600/20"
          >
            {isReviewing ? <Icon name="refresh" className="animate-spin" size={14}/> : <Icon name="zap" size={14}/>}
            {isReviewing ? "正在推理审计..." : "启动 AI 审计"}
          </button>
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Side: Controls */}
        <aside className="w-80 border-r border-slate-800/60 bg-[#0f172a]/40 flex flex-col p-5 space-y-6 overflow-y-auto custom-scrollbar">
          {mode === 'remote' ? (
            <div className="flex flex-col space-y-5">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">远程同步审计</span>
                <p className="text-[9px] text-slate-500">同步 Bitbucket 或 GitHub 进行工程化审计</p>
              </div>

              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button 
                  onClick={() => setRemoteConfig(prev => ({ ...prev, provider: RemoteProvider.GITHUB, branch: 'main' }))}
                  className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${remoteConfig.provider === RemoteProvider.GITHUB ? 'bg-slate-800 text-white' : 'text-slate-600'}`}
                >GitHub</button>
                <button 
                  onClick={() => setRemoteConfig(prev => ({ ...prev, provider: RemoteProvider.BITBUCKET, branch: 'master' }))}
                  className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${remoteConfig.provider === RemoteProvider.BITBUCKET ? 'bg-slate-800 text-white' : 'text-slate-600'}`}
                >Bitbucket</button>
              </div>
              
              <div className="space-y-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                <div className="space-y-1.5">
                  <label className="text-[9px] text-slate-400 uppercase font-black">仓库路径 (Workspace/Repo)</label>
                  <input 
                    value={`${remoteConfig.owner}${remoteConfig.owner && remoteConfig.repo ? '/' : ''}${remoteConfig.repo}`}
                    onChange={(e) => {
                      const [o, r] = e.target.value.split('/');
                      setRemoteConfig(prev => ({ ...prev, owner: o || '', repo: r || '' }));
                    }}
                    placeholder="owner/repo"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-indigo-300 outline-none"
                  />
                </div>
                {remoteConfig.provider === RemoteProvider.BITBUCKET && (
                  <div className="space-y-3">
                    <input value={remoteConfig.username || ""} onChange={e => setRemoteConfig(prev => ({ ...prev, username: e.target.value }))} placeholder="Bitbucket 用户名" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs outline-none" />
                    <input type="password" value={remoteConfig.password || ""} onChange={e => setRemoteConfig(prev => ({ ...prev, password: e.target.value }))} placeholder="App Password" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs outline-none" />
                  </div>
                )}
                {remoteConfig.provider === RemoteProvider.GITHUB && (
                  <input type="password" value={remoteConfig.token || ""} onChange={e => setRemoteConfig(prev => ({ ...prev, token: e.target.value }))} placeholder="GitHub Token (可选)" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs outline-none" />
                )}
                <button onClick={fetchRemoteFiles} disabled={isSyncing} className="w-full py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:bg-indigo-500 transition-colors">
                  {isSyncing ? "正在拉取..." : "拉取远程代码"}
                </button>
              </div>
              <div className="flex-1 space-y-1">
                <span className="text-[9px] font-black uppercase text-slate-600 px-2">拉取文件 ({remoteFiles.length})</span>
                {remoteFiles.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800/40 rounded-lg group">
                    <Icon name="copy" size={10} className="text-slate-600 group-hover:text-indigo-400"/>
                    <span className="text-[10px] font-mono truncate text-slate-400 group-hover:text-slate-200">{f.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full space-y-5">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">本地代码扫描</span>
                <p className="text-[9px] text-slate-500">上传项目目录或直接粘贴代码片段</p>
              </div>

              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button onClick={() => setMode('project')} className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${mode === 'project' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600'}`}>文件夹模式</button>
                <button onClick={() => setMode('single')} className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${mode === 'single' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600'}`}>代码粘贴</button>
              </div>

              {mode === 'project' ? (
                <div className="flex flex-col flex-1 space-y-4">
                  <button onClick={() => folderInputRef.current?.click()} className="w-full py-6 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all text-slate-500 group">
                    <Icon name="copy" size={28} className="group-hover:text-indigo-400 transition-transform group-hover:scale-110"/>
                    <span className="text-[10px] font-bold uppercase tracking-widest">选择本地工程文件夹</span>
                  </button>
                  <input type="file" ref={folderInputRef} // @ts-ignore
                  webkitdirectory="true" directory="" className="hidden" onChange={(e) => processLocalFolder(e.target.files)} />
                  <div className="flex-1 overflow-y-auto space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-600 px-2 mb-2 block">已载入文件 ({projectFiles.length})</span>
                    {projectFiles.map((f, idx) => (
                      <div key={idx} className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-slate-400 hover:bg-slate-800/30 rounded-lg">
                        <div className="w-1 h-1 bg-slate-700 rounded-full"></div>
                        <span className="truncate font-mono">{f.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col flex-1 space-y-4 overflow-hidden">
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-slate-500 uppercase font-black tracking-widest">虚拟文件名 / 语言识别</label>
                    <input value={pastedFileName} onChange={e => setPastedFileName(e.target.value)} placeholder="App.java" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-indigo-300 outline-none" />
                  </div>
                  <div className="flex-1 flex flex-col border border-slate-800 rounded-2xl overflow-hidden bg-slate-950 shadow-inner">
                     <Editor
                        value={pastedCode}
                        onValueChange={code => setPastedCode(code)}
                        highlight={code => Prism.highlight(code, Prism.languages[getLanguage(pastedFileName)], getLanguage(pastedFileName))}
                        padding={15}
                        className="font-mono text-[11px] flex-1 overflow-auto"
                        style={{ outline: 'none' }}
                        textareaClassName="outline-none focus:ring-0"
                      />
                  </div>
                  <p className="text-[9px] text-slate-600 italic">编辑器支持 Java, SQL, Vue, TS, JS 等多种高亮</p>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Center Report Area */}
        <section className="flex-1 flex flex-col bg-[#0b0f1a] overflow-hidden relative">
          {isReviewing ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-500">
              <div className="relative">
                <div className="w-24 h-24 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Icon name="zap" size={32} className="text-indigo-400 animate-pulse"/>
                </div>
              </div>
              <div className="text-center space-y-2">
                <p className="text-indigo-400 font-black text-xl tracking-tighter uppercase italic">Gemini Reasoning...</p>
                <p className="text-slate-600 text-[10px] font-mono tracking-widest">Applying Alibaba P3C Standards & Logic Analysis</p>
              </div>
            </div>
          ) : !reviewResult ? (
            <div className="flex-1 flex flex-col items-center justify-center p-20 text-center opacity-30 select-none">
              <Icon name="shield" size={100} className="mb-8 text-slate-800"/>
              <h2 className="text-3xl font-black text-white mb-4 tracking-tighter uppercase italic">等待审计引擎启动</h2>
              <p className="text-sm max-w-sm text-slate-500 leading-relaxed font-medium">
                通过左侧面板载入代码。无论是整个工程文件夹，<br/>
                还是粘贴的临时代码片段，我们都能进行深度诊断。
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="p-10 border-b border-slate-800/40 bg-[#0f172a]/20 backdrop-blur-sm flex justify-between items-start">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">工程代码审计报告</h2>
                    <span className="bg-indigo-500/10 text-indigo-400 text-[10px] font-black px-3 py-1 rounded-full border border-indigo-500/20">PRO EDITION</span>
                  </div>
                  <p className="text-slate-400 text-sm max-w-4xl leading-relaxed font-medium">{reviewResult.summary}</p>
                </div>
                <div className="p-8 bg-slate-900/80 rounded-[32px] border border-slate-800 flex flex-col items-center min-w-[160px] shadow-2xl backdrop-blur-md">
                  <span className={`text-6xl font-black ${reviewResult.score >= 80 ? 'text-emerald-400' : reviewResult.score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                    {reviewResult.score}
                  </span>
                  <span className="text-[10px] font-black text-slate-500 uppercase mt-3 tracking-widest">合规度评分</span>
                </div>
              </div>

              <div className="flex-1 flex overflow-hidden p-8 gap-8">
                {/* Issues Sidebar */}
                <div className="w-5/12 overflow-y-auto space-y-4 pr-4 custom-scrollbar">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase text-slate-600 tracking-widest">诊断列表 ({reviewResult.issues.length})</span>
                  </div>
                  {reviewResult.issues.map(issue => (
                    <button 
                      key={issue.id}
                      onClick={() => setSelectedIssue(issue)}
                      className={`w-full text-left p-5 rounded-2xl border transition-all duration-300 relative group overflow-hidden ${selectedIssue?.id === issue.id ? 'bg-slate-800/80 border-indigo-500/50 shadow-2xl scale-[1.02]' : 'bg-slate-900/30 border-slate-800 hover:border-slate-700 hover:bg-slate-800/20'}`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                         <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg ${issue.severity === Severity.CRITICAL ? 'bg-red-500/10 text-red-400 border border-red-500/20' : issue.severity === Severity.WARNING ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                          {issue.severity}
                         </span>
                         <span className="text-[10px] font-mono text-slate-500 truncate group-hover:text-slate-400">{issue.filename}{issue.line ? `:${issue.line}` : ''}</span>
                      </div>
                      <h4 className="text-[14px] font-black text-slate-200 leading-tight group-hover:text-white transition-colors">{issue.title}</h4>
                      {selectedIssue?.id === issue.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>}
                    </button>
                  ))}
                </div>

                {/* Details Viewer */}
                <div className="w-7/12 bg-slate-900/20 rounded-[40px] border border-slate-800/50 overflow-hidden flex flex-col shadow-inner relative group/detail">
                  {selectedIssue ? (
                    <div className="flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                      <div className="p-10 border-b border-slate-800/40 bg-slate-900/40">
                         <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                           <Icon name="eye" size={14}/> 诊断详情
                         </div>
                         <h3 className="text-2xl font-black text-white mb-4 leading-tight">{selectedIssue.title}</h3>
                         <p className="text-sm text-slate-400 leading-relaxed font-medium">{selectedIssue.description}</p>
                      </div>
                      <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
                        <div className="space-y-4">
                           <h4 className="text-[11px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                             <Icon name="check" size={16}/> 修正建议与规约对标
                           </h4>
                           <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-3xl text-[14px] text-slate-300 leading-relaxed shadow-sm">
                             {selectedIssue.suggestion}
                           </div>
                        </div>
                        {selectedIssue.codeSnippet && (
                          <div className="space-y-4">
                             <div className="flex items-center justify-between">
                               <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                 <Icon name="code" size={16}/> 源码引用
                               </h4>
                               <span className="text-[9px] font-mono text-slate-600">{selectedIssue.filename}</span>
                             </div>
                             <div className="rounded-3xl overflow-hidden border border-slate-800/80 shadow-2xl group-hover/detail:border-indigo-500/20 transition-colors">
                               <HighlightingCodeBlock 
                                code={selectedIssue.codeSnippet} 
                                language={getLanguage(selectedIssue.filename)} 
                                className="!p-8 !bg-[#050505] !m-0 !text-[13px] !leading-relaxed" 
                               />
                             </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-700 space-y-4">
                      <div className="p-6 rounded-full bg-slate-800/10">
                        <Icon name="eye" size={48} className="opacity-20"/>
                      </div>
                      <p className="text-[11px] font-black uppercase tracking-[0.3em]">选择一项诊断以展开精细化建议</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {error && (
        <div className="fixed top-24 right-10 bg-red-600/90 backdrop-blur-xl text-white px-8 py-5 rounded-[24px] shadow-2xl z-[200] border border-red-500/50 animate-in slide-in-from-right duration-500 flex items-center gap-6">
          <div className="p-2 bg-white/10 rounded-xl">
            <Icon name="alert" size={24}/>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase opacity-60">System Error</span>
            <span className="text-[13px] font-bold">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="ml-4 p-2 hover:bg-white/10 rounded-full transition-colors">
            <Icon name="refresh" size={16} className="rotate-45"/>
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
