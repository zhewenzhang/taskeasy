
import React, { useState, useEffect, useCallback } from 'react';
import { AppState, TaskInput, Question, Task, UserSettings } from './types';
import { generateAssessmentQuestions, analyzeTaskWithGemini } from './services/geminiService';
import { supabaseService } from './services/supabaseService';
import { Button, Card, InputField, TextArea } from './components/UiComponents';
import { Matrix } from './components/Matrix';
import { BrainCircuit, ArrowRight, RotateCcw, Terminal, Plus, X, LayoutGrid, ListTodo, Save, CalendarDays, Settings, Database, UserCog, MessageSquareDashed, KeyRound, Cloud } from 'lucide-react';

const DEFAULT_SETTINGS: UserSettings = {
  geminiApiKey: "",
  customPrompt: "",
  userContext: "",
  supabaseUrl: "",
  supabaseKey: ""
};

const App: React.FC = () => {
  // Load tasks and settings from local storage
  const [state, setState] = useState<AppState>(() => {
    const savedTasks = localStorage.getItem('matrix_ai_tasks');
    const savedSettings = localStorage.getItem('matrix_ai_settings');
    
    return {
      view: 'dashboard',
      wizardStep: 'input',
      currentTaskInput: null,
      currentQuestions: [],
      currentAnswers: {},
      currentAnalysis: null,
      error: null,
      tasks: savedTasks ? JSON.parse(savedTasks) : [],
      settings: savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS,
      isSyncing: false
    };
  });

  const [isLoading, setIsLoading] = useState(false);
  const [inputName, setInputName] = useState('');
  const [inputTime, setInputTime] = useState(''); 
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Temp state for settings form
  const [tempSettings, setTempSettings] = useState<UserSettings>(state.settings);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');

  // Check if Supabase is configured
  const isSupabaseConfigured = !!(state.settings.supabaseUrl && state.settings.supabaseKey);

  // --- Data Persistence & Sync ---

  // Function to refresh tasks from source (DB or Local)
  const refreshTasks = useCallback(async () => {
    if (isSupabaseConfigured) {
      setState(prev => ({ ...prev, isSyncing: true }));
      try {
        const tasks = await supabaseService.fetchTasks(state.settings);
        setState(prev => ({ ...prev, tasks, isSyncing: false }));
        // Also update local cache just in case
        localStorage.setItem('matrix_ai_tasks', JSON.stringify(tasks));
      } catch (error) {
        console.error("Failed to fetch from Supabase:", error);
        setState(prev => ({ ...prev, isSyncing: false, error: "无法连接数据库，已切换至本地缓存。" }));
      }
    } else {
      // Already loaded from init state, but just ensures sync
      const savedTasks = localStorage.getItem('matrix_ai_tasks');
      if (savedTasks) {
        setState(prev => ({ ...prev, tasks: JSON.parse(savedTasks) }));
      }
    }
  }, [isSupabaseConfigured, state.settings]);

  // Initial Load
  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  // Persist Settings
  useEffect(() => {
    localStorage.setItem('matrix_ai_settings', JSON.stringify(state.settings));
  }, [state.settings]);

  // Persist Tasks to Local Storage (Always as backup)
  useEffect(() => {
    if (!isSupabaseConfigured) {
      localStorage.setItem('matrix_ai_tasks', JSON.stringify(state.tasks));
    }
  }, [state.tasks, isSupabaseConfigured]);


  // --- Actions ---

  const startNewTask = () => {
    setState(prev => ({ 
      ...prev, 
      view: 'wizard', 
      wizardStep: 'input', 
      currentTaskInput: null,
      currentAnalysis: null,
      currentAnswers: {},
      currentQuestions: [],
      error: null
    }));
    setInputName('');
    const today = new Date().toISOString().split('T')[0];
    setInputTime(today);
    setSelectedTask(null);
  };

  const navigateTo = (view: 'dashboard' | 'wizard' | 'settings') => {
    if (view === 'settings') {
      setTempSettings(state.settings);
      setConnectionStatus('idle');
    }
    setState(prev => ({ ...prev, view, error: null }));
  };

  const deleteTask = async (taskId: string) => {
    // Optimistic update
    const previousTasks = state.tasks;
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.filter(t => t.id !== taskId)
    }));
    if (selectedTask?.id === taskId) setSelectedTask(null);

    // DB Sync
    if (isSupabaseConfigured) {
      try {
        await supabaseService.deleteTask(taskId, state.settings);
      } catch (error) {
        console.error("Failed to delete task in DB:", error);
        setState(prev => ({ ...prev, tasks: previousTasks, error: "删除失败，已还原" }));
      }
    }
  };

  const saveSettings = () => {
    setState(prev => ({ ...prev, settings: tempSettings, view: 'dashboard' }));
  };

  const testSupabaseConnection = async () => {
    setConnectionStatus('testing');
    const success = await supabaseService.testConnection(tempSettings);
    setConnectionStatus(success ? 'success' : 'failed');
  };

  // --- Date Helpers ---
  const setDateOffset = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const dateString = date.toISOString().split('T')[0];
    setInputTime(dateString);
  };

  // --- Wizard Handlers ---

  const handleStartAssessment = async () => {
    if (!inputName || !inputTime) return;
    
    setIsLoading(true);
    setState(prev => ({ ...prev, error: null }));
    
    try {
      const taskInput = { name: inputName, estimatedTime: inputTime };
      const questionTexts = await generateAssessmentQuestions(taskInput, state.settings);
      const questions: Question[] = questionTexts.map((text, i) => ({ id: i.toString(), text }));
      
      setState(prev => ({
        ...prev,
        wizardStep: 'assessment',
        currentTaskInput: taskInput,
        currentQuestions: questions
      }));
    } catch (error) {
      const msg = (error as Error).message;
      setState(prev => ({ ...prev, error: `AI初始化失败: ${msg}` }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!state.currentTaskInput) return;
    
    setIsLoading(true);
    setState(prev => ({ ...prev, wizardStep: 'analyzing', error: null }));

    try {
      const questionTexts = state.currentQuestions.map(q => q.text);
      const result = await analyzeTaskWithGemini(
        state.currentTaskInput, 
        questionTexts, 
        state.currentAnswers,
        state.settings
      );
      
      setState(prev => ({
        ...prev,
        wizardStep: 'result',
        currentAnalysis: result
      }));
    } catch (error) {
       const msg = (error as Error).message;
      setState(prev => ({ 
        ...prev, 
        wizardStep: 'assessment', 
        error: `分析失败: ${msg}` 
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveTask = async () => {
    if (!state.currentTaskInput || !state.currentAnalysis) return;

    const newTask: Task = {
      id: crypto.randomUUID(),
      name: state.currentTaskInput.name,
      estimatedTime: state.currentTaskInput.estimatedTime,
      createdAt: Date.now(),
      ...state.currentAnalysis
    };

    // Optimistic UI update
    setState(prev => ({
      ...prev,
      tasks: [...prev.tasks, newTask],
      view: 'dashboard',
      wizardStep: 'input'
    }));

    // DB Sync
    if (isSupabaseConfigured) {
      try {
        await supabaseService.addTask(newTask, state.settings);
      } catch (error) {
        console.error("Failed to save to DB:", error);
        setState(prev => ({ 
          ...prev, 
          error: "任务已保存到本地，但同步到数据库失败。" 
        }));
      }
    }
  };

  const toggleAnswer = (id: string, value: boolean) => {
    setState(prev => ({
      ...prev,
      currentAnswers: { ...prev.currentAnswers, [id]: value }
    }));
  };

  // --- Views ---

  const renderSettings = () => (
    <div className="w-full max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between mb-8 sticky top-20 z-30 bg-[#0f172a]/95 py-4 border-b border-slate-800">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">系统设置</h2>
          <p className="text-slate-400 text-sm">System Configuration</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => navigateTo('dashboard')}>
            取消
          </Button>
          <Button onClick={saveSettings}>
            <Save className="w-4 h-4 mr-2" /> 保存配置
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        
        {/* API Keys Section */}
        <Card title="API 密钥配置" actions={<KeyRound className="text-yellow-400 w-5 h-5" />}>
          <div className="bg-yellow-400/5 border border-yellow-400/20 p-4 rounded-lg mb-6 text-sm text-yellow-200/80">
             如果您没有配置，系统将尝试使用环境变量中的默认密钥。建议配置您自己的密钥以避免限流。
          </div>
          <InputField
            label="Gemini API Key"
            type="password"
            placeholder="AIzaSy..."
            value={tempSettings.geminiApiKey}
            onChange={(e) => setTempSettings({...tempSettings, geminiApiKey: e.target.value})}
            helperText="您的 API 密钥仅会存储在本地浏览器中，直接与 Google 服务器通信。"
          />
        </Card>

        {/* Database Section */}
        <Card title="Supabase 数据库连接" actions={<Database className="text-blue-400 w-5 h-5" />}>
           <div className="space-y-4">
             <div className="grid md:grid-cols-2 gap-6">
               <InputField
                  label="Project URL"
                  placeholder="https://xyz.supabase.co"
                  value={tempSettings.supabaseUrl}
                  onChange={(e) => setTempSettings({...tempSettings, supabaseUrl: e.target.value})}
               />
               <InputField
                  label="Anon / Public Key"
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={tempSettings.supabaseKey}
                  onChange={(e) => setTempSettings({...tempSettings, supabaseKey: e.target.value})}
               />
             </div>
             
             <div className="flex justify-between items-center bg-slate-950 p-4 rounded-lg border border-slate-800">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-300">连接测试</span>
                  <span className="text-xs text-slate-500">验证您的 Supabase 凭证是否有效</span>
                </div>
                
                <div className="flex items-center gap-3">
                  {connectionStatus === 'success' && <span className="text-emerald-400 text-sm font-bold">连接成功</span>}
                  {connectionStatus === 'failed' && <span className="text-rose-400 text-sm font-bold">连接失败</span>}
                  <Button 
                    variant="outline" 
                    onClick={testSupabaseConnection} 
                    isLoading={connectionStatus === 'testing'}
                    disabled={!tempSettings.supabaseUrl || !tempSettings.supabaseKey}
                  >
                    测试连接
                  </Button>
                </div>
             </div>

             <div className="text-xs text-slate-500 mt-4 p-4 bg-slate-900/50 rounded border border-slate-800 font-mono">
               <p className="mb-2 text-slate-400 font-bold">SQL Setup Required:</p>
               <p>Create a table named 'tasks' in your Supabase SQL editor to enable syncing.</p>
             </div>
           </div>
        </Card>

        {/* AI Context Section */}
        <Card title="AI 个性化微调" actions={<UserCog className="text-fuchsia-400 w-5 h-5" />}>
          <TextArea
            label="用户角色设定 (User Context)"
            placeholder="例如：我是互联网公司的高级产品经理，关注敏捷开发和团队协作..."
            value={tempSettings.userContext}
            onChange={(e) => setTempSettings({...tempSettings, userContext: e.target.value})}
            helperText="AI 将根据您的角色背景，提供更具针对性的建议和优先级判断。"
            className="min-h-[100px]"
          />
          <TextArea
            label="高级指令 (System Prompt)"
            placeholder="例如：请用更严厉的语气指出我的时间管理漏洞..."
            value={tempSettings.customPrompt}
            onChange={(e) => setTempSettings({...tempSettings, customPrompt: e.target.value})}
            helperText="这些指令将附加在系统标准 Prompt 之后。"
            className="min-h-[100px]"
          />
        </Card>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="w-full animate-in fade-in duration-500 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 px-2">
        <div className="flex items-center gap-4">
           <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-900/30">
             <LayoutGrid className="text-white w-6 h-6" /> 
           </div>
           <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">任务矩阵看板</h2>
              <div className="flex items-center gap-2 text-sm text-slate-400 mt-1">
                <span>Task Priority Matrix</span>
                {isSupabaseConfigured ? (
                   <span className="flex items-center text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/50 text-xs">
                     <Cloud className="w-3 h-3 mr-1" /> Cloud Sync
                   </span>
                ) : (
                   <span className="flex items-center text-slate-500 bg-slate-800 px-2 py-0.5 rounded text-xs">
                     <Database className="w-3 h-3 mr-1" /> Local
                   </span>
                )}
                {state.isSyncing && <span className="text-blue-400 animate-pulse text-xs">同步中...</span>}
              </div>
           </div>
        </div>
        <Button onClick={startNewTask} className="!py-2.5 !px-5">
          <Plus className="w-5 h-5 mr-2 inline" /> 新建任务
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 h-full">
        {/* Matrix Section */}
        <div className="lg:col-span-3 h-full">
          <Matrix tasks={state.tasks} onTaskClick={setSelectedTask} />
        </div>

        {/* Task Detail Sidebar */}
        <div className="lg:col-span-1 h-full max-h-[78vh] overflow-y-auto custom-scrollbar">
          {selectedTask ? (
            <Card title="任务详情" className="h-full border-t-4 border-t-blue-500 flex flex-col shadow-2xl">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-xl font-bold text-white leading-tight mr-2">{selectedTask.name}</h3>
                <button onClick={() => deleteTask(selectedTask.id)} className="text-slate-500 hover:text-rose-500 transition-colors p-1.5 hover:bg-rose-500/10 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-6 text-sm flex-1">
                
                {/* Time & Quadrant */}
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-lg border border-slate-800">
                     <span className="text-slate-400 text-xs uppercase font-bold tracking-wider">优先级分类</span>
                     <span className={`font-bold text-base px-3 py-1 rounded-full bg-opacity-10 border
                      ${selectedTask.quadrant === 'Do' ? 'text-blue-400 bg-blue-400 border-blue-400/30' : 
                        selectedTask.quadrant === 'Plan' ? 'text-emerald-400 bg-emerald-400 border-emerald-400/30' : 
                        selectedTask.quadrant === 'Delegate' ? 'text-amber-400 bg-amber-400 border-amber-400/30' : 'text-rose-400 bg-rose-400 border-rose-400/30'}`}>
                       {selectedTask.quadrant}
                     </span>
                  </div>
                  <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-lg border border-slate-800">
                     <span className="text-slate-400 text-xs uppercase font-bold tracking-wider">截止日期</span>
                     <span className="font-mono font-bold text-slate-200 text-base">{selectedTask.estimatedTime}</span>
                  </div>
                </div>

                {/* Reasoning */}
                <div className="bg-slate-900/30 p-5 rounded-lg border border-slate-800">
                  <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider font-bold">分类逻辑</div>
                  <div className="text-slate-300 leading-relaxed text-sm">"{selectedTask.reasoning}"</div>
                </div>

                {/* Steps */}
                <div>
                  <div className="text-xs text-blue-400 mb-3 uppercase tracking-wider font-bold flex items-center gap-2 border-b border-slate-800 pb-2">
                    <ListTodo className="w-4 h-4" /> 执行步骤
                  </div>
                  <ul className="space-y-3">
                    {selectedTask.steps.map((step, i) => (
                      <li key={i} className="flex gap-3 text-slate-300 text-sm">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-mono shrink-0 font-bold">{i+1}</span>
                        <span className="leading-snug">{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Advice */}
                <div>
                   <div className="text-xs text-fuchsia-400 mb-3 uppercase tracking-wider font-bold flex items-center gap-2 border-b border-slate-800 pb-2">
                    <BrainCircuit className="w-4 h-4" /> 智能建议
                  </div>
                  <p className="text-slate-300 text-sm leading-relaxed bg-gradient-to-br from-fuchsia-900/10 to-purple-900/10 p-4 rounded-lg border border-fuchsia-500/20 shadow-inner">
                    {selectedTask.advice}
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <div className="h-full border-2 border-dashed border-slate-700/50 rounded-xl flex flex-col items-center justify-center text-slate-500 p-8 text-center bg-slate-800/20">
              <LayoutGrid className="w-16 h-16 mb-6 opacity-20" />
              <h3 className="text-lg font-medium text-slate-400">选择任务查看详情</h3>
              <p className="text-sm mt-2 opacity-60 max-w-[200px]">点击左侧矩阵中的任意卡片，获取AI深度分析报告。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderWizard = () => (
    <div className="w-full max-w-3xl mx-auto pt-6">
      <div className="mb-8 flex items-center gap-2 text-slate-400 cursor-pointer hover:text-blue-400 transition-colors w-fit group" onClick={() => navigateTo('dashboard')}>
        <div className="p-1 rounded-full bg-slate-800 group-hover:bg-blue-500/20 transition-colors">
           <RotateCcw className="w-4 h-4" /> 
        </div>
        <span className="text-base font-medium">返回看板</span>
      </div>

      {state.error && (
        <div className="mb-8 p-4 bg-rose-950/30 border border-rose-900 text-rose-300 text-base rounded-lg flex items-center gap-3 shadow-lg">
          <X className="w-5 h-5 shrink-0" /> {state.error}
        </div>
      )}

      {/* STEP 1: INPUT */}
      {state.wizardStep === 'input' && (
        <Card title="创建新任务" className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="space-y-8 py-4">
            <InputField 
              label="任务名称" 
              placeholder="输入具体的任务内容..."
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
            />
            
            {/* Date Input Section */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-400 mb-3">截止日期 (Expected Deadline)</label>
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <input 
                  type="date"
                  className="bg-slate-950 border border-slate-700 text-slate-100 text-lg p-3 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all w-full sm:w-auto min-w-[200px]"
                  value={inputTime}
                  onChange={(e) => setInputTime(e.target.value)}
                  style={{ colorScheme: 'dark' }} 
                />
                
                <div className="flex gap-2 flex-wrap">
                   <button 
                    onClick={() => setDateOffset(1)}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-500 text-sm font-medium rounded-md transition-all"
                  >
                    明天 (+1)
                  </button>
                  <button 
                    onClick={() => setDateOffset(3)}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-500 text-sm font-medium rounded-md transition-all"
                  >
                    3天后
                  </button>
                  <button 
                    onClick={() => setDateOffset(7)}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-500 text-sm font-medium rounded-md transition-all"
                  >
                    下周
                  </button>
                </div>
              </div>
            </div>
            
            <div className="pt-6 flex justify-end border-t border-slate-700/50">
              <Button 
                onClick={handleStartAssessment} 
                disabled={!inputName || !inputTime}
                isLoading={isLoading}
                className="w-full sm:w-auto"
              >
                开始 AI 评估 <ArrowRight className="inline w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* STEP 2: ASSESSMENT */}
      {state.wizardStep === 'assessment' && (
        <Card title="情境评估" className="animate-in fade-in slide-in-from-right-8 duration-500">
          <div className="space-y-8 py-2">
            <div className="flex items-center justify-between text-base text-slate-300 bg-slate-800/50 p-4 rounded-lg border border-slate-700">
              <div className="flex items-center gap-3">
                <Terminal className="w-5 h-5 text-blue-400" />
                <span className="font-medium">{state.currentTaskInput?.name}</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-sm text-slate-400">
                <CalendarDays className="w-4 h-4" />
                {state.currentTaskInput?.estimatedTime}
              </div>
            </div>

            <div className="space-y-5">
              {state.currentQuestions.map((q, index) => (
                <div key={q.id} className="p-5 bg-slate-900 border border-slate-700 rounded-xl hover:border-slate-600 transition-colors">
                  <p className="mb-4 text-lg text-slate-200 font-medium leading-snug">{q.text}</p>
                  <div className="flex gap-4">
                    <button
                      onClick={() => toggleAnswer(index.toString(), true)}
                      className={`flex-1 py-3 text-sm font-bold uppercase tracking-wide border transition-all rounded-lg
                        ${state.currentAnswers[index.toString()] === true 
                          ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/30' 
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                        }`}
                    >
                      是 (YES)
                    </button>
                    <button
                      onClick={() => toggleAnswer(index.toString(), false)}
                      className={`flex-1 py-3 text-sm font-bold uppercase tracking-wide border transition-all rounded-lg
                        ${state.currentAnswers[index.toString()] === false 
                          ? 'bg-slate-200 border-slate-200 text-slate-900 shadow-lg' 
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                        }`}
                    >
                      否 (NO)
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-6 flex justify-end gap-4 border-t border-slate-700/50">
              <Button variant="outline" onClick={startNewTask} disabled={isLoading}>
                重置
              </Button>
              <Button 
                onClick={handleAnalyze} 
                disabled={Object.keys(state.currentAnswers).length !== state.currentQuestions.length}
                isLoading={isLoading}
              >
                生成决策方案
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* STEP 3: LOADING */}
      {state.wizardStep === 'analyzing' && (
        <div className="flex flex-col items-center justify-center h-80 animate-in fade-in duration-500 bg-slate-900/30 rounded-2xl border border-slate-800">
          <div className="relative w-20 h-20 mb-8">
            <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="text-lg font-medium text-slate-300 animate-pulse">正在构建任务决策模型...</p>
          <p className="text-sm text-slate-500 mt-2">AI 正在分析您的回答与上下文</p>
        </div>
      )}

      {/* STEP 4: RESULT PREVIEW */}
      {state.wizardStep === 'result' && state.currentAnalysis && (
        <div className="space-y-8 animate-in zoom-in-95 duration-500">
          <Card title="决策分析报告" className="border-t-4 border-t-blue-500 shadow-2xl">
            <div className="space-y-8 py-2">
              
              <div>
                <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <span className={`w-4 h-4 rounded-full ${
                    state.currentAnalysis.quadrant === 'Do' ? 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]' :
                    state.currentAnalysis.quadrant === 'Plan' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' :
                    state.currentAnalysis.quadrant === 'Delegate' ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]' : 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]'
                  }`}></span>
                  {state.currentAnalysis.quadrant === 'Do' ? '重要且紧急 (Do)' :
                   state.currentAnalysis.quadrant === 'Plan' ? '重要不紧急 (Plan)' :
                   state.currentAnalysis.quadrant === 'Delegate' ? '不重要紧急 (Delegate)' : '不重要不紧急 (Eliminate)'}
                </h3>
                <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
                   <p className="text-slate-300 italic text-lg leading-relaxed">
                    "{state.currentAnalysis.reasoning}"
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800">
                  <h4 className="text-sm font-bold uppercase text-blue-400 mb-4 flex items-center gap-2 tracking-wider">
                    <Terminal className="w-4 h-4" />
                    执行路径
                  </h4>
                  <ul className="space-y-4">
                    {state.currentAnalysis.steps.map((step, i) => (
                      <li key={i} className="flex gap-3 text-base text-slate-300">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 text-xs font-bold shrink-0 border border-blue-500/20">{i+1}</span>
                        <span className="leading-snug">{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800">
                  <h4 className="text-sm font-bold uppercase text-fuchsia-400 mb-4 flex items-center gap-2 tracking-wider">
                    <BrainCircuit className="w-4 h-4" />
                    智能建议
                  </h4>
                  <p className="text-base text-slate-300 leading-relaxed">
                    {state.currentAnalysis.advice}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-6 border-t border-slate-700/50">
                 <Button variant="outline" onClick={startNewTask}>
                  <RotateCcw className="w-5 h-5 mr-2 inline" /> 重新评估
                </Button>
                <Button onClick={handleSaveTask}>
                  <Save className="w-5 h-5 mr-2 inline" /> 存入矩阵
                </Button>
              </div>

            </div>
          </Card>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 flex flex-col selection:bg-blue-500/30 font-sans antialiased">
      
      {/* Header */}
      <header className="w-full border-b border-slate-800 bg-[#0f172a]/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="w-full px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigateTo('dashboard')}>
            <div className="bg-gradient-to-br from-blue-600 to-cyan-500 p-2 rounded-lg shadow-lg shadow-blue-500/20">
               <BrainCircuit className="w-6 h-6 text-white" />
            </div>
            <div>
               <h1 className="text-xl font-bold tracking-tight text-white leading-none">
                MATRIX <span className="text-blue-400">AI</span>
              </h1>
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Strategy System</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
             {state.view !== 'settings' && (
               <button 
                onClick={() => navigateTo('settings')}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
               </button>
             )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full p-4 md:p-8 max-w-[1920px] mx-auto overflow-hidden">
        {state.view === 'dashboard' ? renderDashboard() : 
         state.view === 'wizard' ? renderWizard() : renderSettings()}
      </main>
    </div>
  );
};

export default App;
