
import React, { useState, useEffect, useCallback } from 'react';
import { AppState, TaskInput, Question, Task, UserSettings, QuadrantType } from './types';
import { generateAssessmentQuestions, analyzeTaskWithGemini } from './services/geminiService';
import { supabaseService } from './services/supabaseService';
import { Button, Card, InputField, TextArea } from './components/UiComponents';
import { Matrix } from './components/Matrix';
import { BrainCircuit, ArrowRight, RotateCcw, Terminal, Plus, X, LayoutGrid, ListTodo, Save, CalendarDays, Settings, Database, UserCog, KeyRound, Cloud, PieChart, CheckCircle, Circle, Activity, BarChart3, Sun, Moon, ChevronLeft, Trash2 } from 'lucide-react';

const DEFAULT_SETTINGS: UserSettings = {
  geminiApiKey: "",
  customPrompt: "",
  userContext: "",
  supabaseUrl: "",
  supabaseKey: ""
};

const App: React.FC = () => {
  // Load state from local storage
  const [state, setState] = useState<AppState>(() => {
    const savedTasks = localStorage.getItem('matrix_ai_tasks');
    const savedSettings = localStorage.getItem('matrix_ai_settings');
    const savedTheme = localStorage.getItem('matrix_ai_theme') as 'light' | 'dark' || 'dark';
    
    return {
      theme: savedTheme,
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

  const isSupabaseConfigured = !!(state.settings.supabaseUrl && state.settings.supabaseKey);

  // --- Effects ---

  // Apply Theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(state.theme);
    localStorage.setItem('matrix_ai_theme', state.theme);
  }, [state.theme]);

  // Data Sync
  const refreshTasks = useCallback(async () => {
    if (isSupabaseConfigured) {
      setState(prev => ({ ...prev, isSyncing: true }));
      try {
        const tasks = await supabaseService.fetchTasks(state.settings);
        setState(prev => ({ ...prev, tasks, isSyncing: false }));
        localStorage.setItem('matrix_ai_tasks', JSON.stringify(tasks));
      } catch (error) {
        console.error("Failed to fetch from Supabase:", error);
        setState(prev => ({ ...prev, isSyncing: false, error: "无法连接数据库，已切换至本地缓存。" }));
      }
    } else {
      const savedTasks = localStorage.getItem('matrix_ai_tasks');
      if (savedTasks) {
        setState(prev => ({ ...prev, tasks: JSON.parse(savedTasks) }));
      }
    }
  }, [isSupabaseConfigured, state.settings]);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  useEffect(() => {
    localStorage.setItem('matrix_ai_settings', JSON.stringify(state.settings));
  }, [state.settings]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      localStorage.setItem('matrix_ai_tasks', JSON.stringify(state.tasks));
    }
  }, [state.tasks, isSupabaseConfigured]);


  // --- Actions ---

  const toggleTheme = () => {
    setState(prev => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }));
  };

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

  const navigateTo = (view: 'dashboard' | 'wizard' | 'settings' | 'stats') => {
    if (view === 'settings') {
      setTempSettings(state.settings);
      setConnectionStatus('idle');
    }
    setState(prev => ({ ...prev, view, error: null }));
  };

  const deleteTask = async (taskId: string) => {
    const previousTasks = state.tasks;
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.filter(t => t.id !== taskId)
    }));
    if (selectedTask?.id === taskId) setSelectedTask(null);

    if (isSupabaseConfigured) {
      try {
        await supabaseService.deleteTask(taskId, state.settings);
      } catch (error) {
        console.error("Failed to delete task in DB:", error);
        setState(prev => ({ ...prev, tasks: previousTasks, error: "删除失败，已还原" }));
      }
    }
  };

  const toggleTaskCompletion = async (task: Task) => {
    const newStatus = !task.isCompleted;
    const now = Date.now();
    
    const updatedTask = { 
      ...task, 
      isCompleted: newStatus, 
      completedAt: newStatus ? now : undefined 
    };

    setState(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === task.id ? updatedTask : t)
    }));
    
    if (selectedTask?.id === task.id) {
      setSelectedTask(updatedTask);
    }

    if (isSupabaseConfigured) {
      try {
        await supabaseService.updateTask(task.id, { 
          isCompleted: newStatus, 
          completedAt: newStatus ? now : undefined 
        }, state.settings);
      } catch (error) {
        console.error("Failed to update task status:", error);
        setState(prev => ({ ...prev, error: "状态同步失败" }));
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

  const setDateOffset = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const dateString = date.toISOString().split('T')[0];
    setInputTime(dateString);
  };

  // --- Wizard Logic ---
  const handleStartAssessment = async () => {
    if (!inputName || !inputTime) return;
    setIsLoading(true);
    setState(prev => ({ ...prev, error: null }));
    try {
      const taskInput = { name: inputName, estimatedTime: inputTime };
      const questionTexts = await generateAssessmentQuestions(taskInput, state.settings);
      const questions: Question[] = questionTexts.map((text, i) => ({ id: i.toString(), text }));
      setState(prev => ({ ...prev, wizardStep: 'assessment', currentTaskInput: taskInput, currentQuestions: questions }));
    } catch (error) {
      setState(prev => ({ ...prev, error: `AI初始化失败: ${(error as Error).message}` }));
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
      const result = await analyzeTaskWithGemini(state.currentTaskInput, questionTexts, state.currentAnswers, state.settings);
      setState(prev => ({ ...prev, wizardStep: 'result', currentAnalysis: result }));
    } catch (error) {
      setState(prev => ({ ...prev, wizardStep: 'assessment', error: `分析失败: ${(error as Error).message}` }));
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
      isCompleted: false,
      ...state.currentAnalysis
    };
    setState(prev => ({ ...prev, tasks: [...prev.tasks, newTask], view: 'dashboard', wizardStep: 'input' }));
    if (isSupabaseConfigured) {
      try { await supabaseService.addTask(newTask, state.settings); } catch (e) { console.error(e); }
    }
  };

  const toggleAnswer = (id: string, value: boolean) => {
    setState(prev => ({ ...prev, currentAnswers: { ...prev.currentAnswers, [id]: value } }));
  };

  // --- Render Components ---

  const renderTaskDetail = (task: Task, isOverlay: boolean = false) => (
    <Card title={isOverlay ? "任务详情" : undefined} className={`h-full border-t-4 border-t-blue-500 flex flex-col shadow-2xl ${!isOverlay ? 'border-slate-200 dark:border-slate-700' : ''}`}>
       {/* Close button for overlay */}
       {isOverlay && (
         <button onClick={() => setSelectedTask(null)} className="absolute top-4 right-4 p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
           <X className="w-5 h-5" />
         </button>
       )}

      <div className={`flex justify-between items-start mb-6 ${isOverlay ? 'mt-4' : ''}`}>
        <h3 className={`text-xl font-bold leading-tight mr-2 ${task.isCompleted ? 'text-slate-400 line-through decoration-slate-400' : 'text-slate-900 dark:text-white'}`}>{task.name}</h3>
        {!isOverlay && (
          <button onClick={() => deleteTask(task.id)} className="text-slate-400 hover:text-rose-500 transition-colors p-1.5 hover:bg-rose-500/10 rounded">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
      
      <div className="space-y-6 text-sm flex-1 overflow-y-auto custom-scrollbar pr-1">
        {/* Completion Toggle */}
        <button 
          onClick={() => toggleTaskCompletion(task)}
          className={`w-full py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 border
          ${task.isCompleted 
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700' 
            : 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 dark:shadow-none'}`}
        >
          {task.isCompleted ? (
             <>
              <RotateCcw className="w-4 h-4" /> 标记为未完成
             </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" /> 标记为已完成
            </>
          )}
        </button>

        <div className="grid grid-cols-1 gap-4">
          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
             <span className="text-slate-500 dark:text-slate-400 text-xs uppercase font-bold tracking-wider">优先级分类</span>
             <span className={`font-bold text-base px-3 py-1 rounded-full bg-opacity-10 border
              ${task.quadrant === 'Do' ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-400/10 border-blue-200 dark:border-blue-400/30' : 
                task.quadrant === 'Plan' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-400/10 border-emerald-200 dark:border-emerald-400/30' : 
                task.quadrant === 'Delegate' ? 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-400/10 border-amber-200 dark:border-amber-400/30' : 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-400/10 border-rose-200 dark:border-rose-400/30'}`}>
               {task.quadrant}
             </span>
          </div>
          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
             <span className="text-slate-500 dark:text-slate-400 text-xs uppercase font-bold tracking-wider">截止日期</span>
             <span className="font-mono font-bold text-slate-700 dark:text-slate-200 text-base">{task.estimatedTime}</span>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/30 p-5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider font-bold">分类逻辑</div>
          <div className="text-slate-700 dark:text-slate-300 leading-relaxed text-sm">"{task.reasoning}"</div>
        </div>

        <div>
          <div className="text-xs text-blue-600 dark:text-blue-400 mb-3 uppercase tracking-wider font-bold flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            <ListTodo className="w-4 h-4" /> 执行步骤
          </div>
          <ul className="space-y-3">
            {task.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-slate-700 dark:text-slate-300 text-sm">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-mono shrink-0 font-bold">{i+1}</span>
                <span className={`leading-snug ${task.isCompleted ? 'line-through opacity-60' : ''}`}>{step}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
           <div className="text-xs text-fuchsia-600 dark:text-fuchsia-400 mb-3 uppercase tracking-wider font-bold flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            <BrainCircuit className="w-4 h-4" /> 智能建议
          </div>
          <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed bg-fuchsia-50 dark:bg-gradient-to-br dark:from-fuchsia-900/10 dark:to-purple-900/10 p-4 rounded-lg border border-fuchsia-100 dark:border-fuchsia-500/20">
            {task.advice}
          </p>
        </div>

        {/* Delete button for overlay */}
        {isOverlay && (
           <div className="pt-6">
             <Button variant="danger" className="w-full" onClick={() => deleteTask(task.id)}>
               <Trash2 className="w-4 h-4 mr-2" /> 删除任务
             </Button>
           </div>
        )}
      </div>
    </Card>
  );

  // --- Views ---

  const renderDashboard = () => (
    <div className="w-full animate-in fade-in duration-500 h-full flex flex-col">
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 px-1 gap-4">
        <div className="flex items-center gap-4">
           <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/30 dark:shadow-blue-900/30">
             <LayoutGrid className="text-white w-6 h-6" /> 
           </div>
           <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">任务矩阵看板</h2>
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mt-1">
                <span>Task Priority Matrix</span>
                {isSupabaseConfigured ? (
                   <span className="flex items-center text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-900/50 text-xs">
                     <Cloud className="w-3 h-3 mr-1" /> Sync On
                   </span>
                ) : (
                   <span className="flex items-center text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded text-xs">
                     <Database className="w-3 h-3 mr-1" /> Local
                   </span>
                )}
                {state.isSyncing && <span className="text-blue-500 animate-pulse text-xs">同步中...</span>}
              </div>
           </div>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <Button variant="secondary" onClick={() => navigateTo('stats')} className="flex-1 md:flex-none !py-2.5 !px-4">
            <BarChart3 className="w-5 h-5 mr-2 inline" /> <span className="hidden md:inline">数据分析</span><span className="md:hidden">分析</span>
          </Button>
          <Button onClick={startNewTask} className="flex-1 md:flex-none !py-2.5 !px-5">
            <Plus className="w-5 h-5 mr-2 inline" /> <span className="hidden md:inline">新建任务</span><span className="md:hidden">新建</span>
          </Button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 md:gap-8 h-full relative">
        {/* Matrix Section */}
        <div className="lg:col-span-3 h-full">
          <Matrix tasks={state.tasks} onTaskClick={setSelectedTask} />
        </div>

        {/* Desktop Sidebar Task Detail */}
        <div className="hidden lg:block lg:col-span-1 h-full max-h-[calc(100vh-180px)] overflow-hidden">
          {selectedTask ? (
            renderTaskDetail(selectedTask)
          ) : (
            <div className="h-full border-2 border-dashed border-slate-200 dark:border-slate-700/50 rounded-xl flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 text-center bg-slate-50/50 dark:bg-slate-800/20">
              <LayoutGrid className="w-16 h-16 mb-6 opacity-20" />
              <h3 className="text-lg font-medium text-slate-500 dark:text-slate-400">选择任务查看详情</h3>
              <p className="text-sm mt-2 opacity-60 max-w-[200px]">点击左侧矩阵中的任意卡片，获取AI深度分析报告。</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile/Tablet Task Detail Overlay */}
      {selectedTask && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-6 animate-in fade-in duration-200">
          <div 
            className="w-full h-[85vh] sm:h-[600px] sm:max-w-lg bg-white dark:bg-[#1e293b] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 duration-300 relative flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 overflow-hidden p-6">
              {renderTaskDetail(selectedTask, true)}
            </div>
          </div>
          {/* Click backdrop to close */}
          <div className="absolute inset-0 -z-10" onClick={() => setSelectedTask(null)}></div>
        </div>
      )}
    </div>
  );

  // Same structure for Stats & Settings, just wrapped with standard container
  const renderStats = () => {
    const total = state.tasks.length;
    const completed = state.tasks.filter(t => t.isCompleted).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    const quadrantStats = {
      [QuadrantType.DO]: state.tasks.filter(t => t.quadrant === QuadrantType.DO).length,
      [QuadrantType.PLAN]: state.tasks.filter(t => t.quadrant === QuadrantType.PLAN).length,
      [QuadrantType.DELEGATE]: state.tasks.filter(t => t.quadrant === QuadrantType.DELEGATE).length,
      [QuadrantType.ELIMINATE]: state.tasks.filter(t => t.quadrant === QuadrantType.ELIMINATE).length,
    };

    return (
       <div className="w-full max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 sticky top-16 md:top-20 z-30 bg-slate-50/95 dark:bg-[#0f172a]/95 py-4 border-b border-slate-200 dark:border-slate-800">
            <div className="mb-4 md:mb-0">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">数据统计分析</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Performance Analytics</p>
            </div>
             <div className="flex gap-3 w-full md:w-auto">
              <Button variant="secondary" onClick={() => navigateTo('dashboard')} className="w-full md:w-auto">
                <ChevronLeft className="w-4 h-4 mr-2" /> 返回看板
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
             <Card className="border-blue-200 dark:border-blue-500/30 bg-blue-50/50 dark:bg-gradient-to-br dark:from-slate-800 dark:to-blue-900/10">
               <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
                     <ListTodo className="w-6 h-6" />
                  </div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium text-sm uppercase tracking-wider">总任务数</span>
               </div>
               <div className="text-4xl font-bold text-slate-900 dark:text-white">{total}</div>
             </Card>

             <Card className="border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-gradient-to-br dark:from-slate-800 dark:to-emerald-900/10">
               <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                     <CheckCircle className="w-6 h-6" />
                  </div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium text-sm uppercase tracking-wider">已完成</span>
               </div>
               <div className="text-4xl font-bold text-slate-900 dark:text-white">{completed}</div>
             </Card>

             <Card className="border-fuchsia-200 dark:border-fuchsia-500/30 bg-fuchsia-50/50 dark:bg-gradient-to-br dark:from-slate-800 dark:to-fuchsia-900/10">
               <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 rounded-lg bg-fuchsia-100 dark:bg-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-400">
                     <Activity className="w-6 h-6" />
                  </div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium text-sm uppercase tracking-wider">完成率</span>
               </div>
               <div className="text-4xl font-bold text-slate-900 dark:text-white">{completionRate}%</div>
             </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
             <Card title="象限分布概览" actions={<PieChart className="w-5 h-5 text-slate-400" />}>
                <div className="space-y-6 mt-2">
                  {[
                    { label: "马上做 (Do)", color: "bg-blue-500", text: "text-blue-600 dark:text-blue-400", count: quadrantStats[QuadrantType.DO] },
                    { label: "计划做 (Plan)", color: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", count: quadrantStats[QuadrantType.PLAN] },
                    { label: "授权做 (Delegate)", color: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", count: quadrantStats[QuadrantType.DELEGATE] },
                    { label: "减少做 (Eliminate)", color: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", count: quadrantStats[QuadrantType.ELIMINATE] }
                  ].map((item, idx) => (
                    <div key={idx}>
                       <div className="flex justify-between text-sm mb-2">
                          <span className={`${item.text} font-bold`}>{item.label}</span>
                          <span className="text-slate-700 dark:text-slate-300 font-mono">{item.count}</span>
                       </div>
                       <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${item.color} transition-all duration-500`} 
                            style={{ width: `${total ? (item.count / total * 100) : 0}%`}}
                          ></div>
                       </div>
                    </div>
                  ))}
                </div>
             </Card>

             <Card title="分析建议" actions={<BarChart3 className="w-5 h-5 text-slate-400" />}>
               <div className="flex items-center justify-center h-64 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/30">
                  <p className="text-slate-500 dark:text-slate-500 text-sm italic text-center px-8">
                     {total > 0 
                       ? "数据分析模块已激活。建议优先处理 'Do' 象限任务，并为 'Plan' 象限任务预留大块时间。" 
                       : "暂无足够数据生成深度建议。请先添加并评估几个任务。"
                     }
                  </p>
               </div>
             </Card>
          </div>
       </div>
    );
  };

  const renderSettings = () => (
    <div className="w-full max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 sticky top-16 md:top-20 z-30 bg-slate-50/95 dark:bg-[#0f172a]/95 py-4 border-b border-slate-200 dark:border-slate-800">
        <div className="mb-4 md:mb-0">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">系统设置</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">System Configuration</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <Button variant="secondary" onClick={() => navigateTo('dashboard')} className="flex-1 md:flex-none">
            取消
          </Button>
          <Button onClick={saveSettings} className="flex-1 md:flex-none">
            <Save className="w-4 h-4 mr-2" /> 保存配置
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Database */}
        <Card title="Supabase 数据库连接" actions={<Database className="text-blue-500 dark:text-blue-400 w-5 h-5" />}>
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
                  placeholder="eyJhbGciOiJIUzI1Ni..."
                  value={tempSettings.supabaseKey}
                  onChange={(e) => setTempSettings({...tempSettings, supabaseKey: e.target.value})}
               />
             </div>
             
             <div className="flex flex-col md:flex-row justify-between items-center bg-slate-50 dark:bg-slate-950 p-4 rounded-lg border border-slate-200 dark:border-slate-800 gap-4">
                <div className="flex flex-col text-center md:text-left">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">连接测试</span>
                  <span className="text-xs text-slate-500">验证您的 Supabase 凭证是否有效</span>
                </div>
                
                <div className="flex items-center gap-3 w-full md:w-auto justify-center">
                  {connectionStatus === 'success' && <span className="text-emerald-500 dark:text-emerald-400 text-sm font-bold">连接成功</span>}
                  {connectionStatus === 'failed' && <span className="text-rose-500 dark:text-rose-400 text-sm font-bold">连接失败</span>}
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
           </div>
        </Card>

        {/* Context */}
        <Card title="AI 个性化微调" actions={<UserCog className="text-fuchsia-500 dark:text-fuchsia-400 w-5 h-5" />}>
          <TextArea
            label="用户角色设定 (User Context)"
            placeholder="例如：我是互联网公司的高级产品经理..."
            value={tempSettings.userContext}
            onChange={(e) => setTempSettings({...tempSettings, userContext: e.target.value})}
            className="min-h-[100px]"
          />
          <TextArea
            label="高级指令 (System Prompt)"
            placeholder="例如：请用更严厉的语气..."
            value={tempSettings.customPrompt}
            onChange={(e) => setTempSettings({...tempSettings, customPrompt: e.target.value})}
            className="min-h-[100px]"
          />
        </Card>
      </div>
    </div>
  );

  const renderWizard = () => (
    <div className="w-full max-w-3xl mx-auto pt-4 md:pt-6">
      <div className="mb-6 md:mb-8 flex items-center gap-2 text-slate-500 dark:text-slate-400 cursor-pointer hover:text-blue-500 transition-colors w-fit group" onClick={() => navigateTo('dashboard')}>
        <div className="p-1 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:bg-blue-500/20 transition-colors">
           <RotateCcw className="w-4 h-4" /> 
        </div>
        <span className="text-base font-medium">返回看板</span>
      </div>

      {state.error && (
        <div className="mb-6 md:mb-8 p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-300 text-base rounded-lg flex items-center gap-3 shadow-lg">
          <X className="w-5 h-5 shrink-0" /> {state.error}
        </div>
      )}

      {/* STEP 1: INPUT */}
      {state.wizardStep === 'input' && (
        <Card title="创建新任务" className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="space-y-6 md:space-y-8 py-4">
            <InputField 
              label="任务名称" 
              placeholder="输入具体的任务内容..."
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
            />
            
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-400 mb-3">截止日期 (Expected Deadline)</label>
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                <input 
                  type="date"
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-lg p-3 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all w-full md:w-auto min-w-[200px]"
                  value={inputTime}
                  onChange={(e) => setInputTime(e.target.value)}
                  style={{ colorScheme: state.theme }}
                />
                
                <div className="flex gap-2 flex-wrap w-full md:w-auto">
                   <button onClick={() => setDateOffset(1)} className="flex-1 md:flex-none px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white text-sm font-medium rounded-md transition-all">明天 (+1)</button>
                   <button onClick={() => setDateOffset(3)} className="flex-1 md:flex-none px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white text-sm font-medium rounded-md transition-all">3天后</button>
                   <button onClick={() => setDateOffset(7)} className="flex-1 md:flex-none px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white text-sm font-medium rounded-md transition-all">下周</button>
                </div>
              </div>
            </div>
            
            <div className="pt-6 flex justify-end border-t border-slate-100 dark:border-slate-700/50">
              <Button onClick={handleStartAssessment} disabled={!inputName || !inputTime} isLoading={isLoading} className="w-full md:w-auto">
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
            <div className="flex items-center justify-between text-base text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <Terminal className="w-5 h-5 text-blue-500" />
                <span className="font-medium">{state.currentTaskInput?.name}</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-sm text-slate-500 dark:text-slate-400">
                <CalendarDays className="w-4 h-4" />
                {state.currentTaskInput?.estimatedTime}
              </div>
            </div>

            <div className="space-y-5">
              {state.currentQuestions.map((q, index) => (
                <div key={q.id} className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                  <p className="mb-4 text-lg text-slate-800 dark:text-slate-200 font-medium leading-snug">{q.text}</p>
                  <div className="flex gap-4">
                    <button onClick={() => toggleAnswer(index.toString(), true)} className={`flex-1 py-3 text-sm font-bold uppercase tracking-wide border transition-all rounded-lg ${state.currentAnswers[index.toString()] === true ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}>是 (YES)</button>
                    <button onClick={() => toggleAnswer(index.toString(), false)} className={`flex-1 py-3 text-sm font-bold uppercase tracking-wide border transition-all rounded-lg ${state.currentAnswers[index.toString()] === false ? 'bg-slate-200 dark:bg-slate-200 border-slate-300 text-slate-900 shadow-lg' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}>否 (NO)</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-6 flex justify-end gap-4 border-t border-slate-100 dark:border-slate-700/50">
              <Button variant="outline" onClick={startNewTask} disabled={isLoading}>重置</Button>
              <Button onClick={handleAnalyze} disabled={Object.keys(state.currentAnswers).length !== state.currentQuestions.length} isLoading={isLoading}>生成决策方案</Button>
            </div>
          </div>
        </Card>
      )}

      {/* STEP 3: LOADING */}
      {state.wizardStep === 'analyzing' && (
        <div className="flex flex-col items-center justify-center h-80 animate-in fade-in duration-500 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="relative w-20 h-20 mb-8">
            <div className="absolute inset-0 border-4 border-slate-200 dark:border-slate-700 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="text-lg font-medium text-slate-600 dark:text-slate-300 animate-pulse">正在构建任务决策模型...</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-2">AI 正在分析您的回答与上下文</p>
        </div>
      )}

      {/* STEP 4: RESULT PREVIEW */}
      {state.wizardStep === 'result' && state.currentAnalysis && (
        <div className="space-y-8 animate-in zoom-in-95 duration-500">
          <Card title="决策分析报告" className="border-t-4 border-t-blue-500 shadow-2xl">
            <div className="space-y-8 py-2">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-3">
                  <span className={`w-4 h-4 rounded-full ${state.currentAnalysis.quadrant === 'Do' ? 'bg-blue-500' : state.currentAnalysis.quadrant === 'Plan' ? 'bg-emerald-500' : state.currentAnalysis.quadrant === 'Delegate' ? 'bg-amber-500' : 'bg-rose-500'}`}></span>
                  {state.currentAnalysis.quadrant === 'Do' ? '重要且紧急 (Do)' : state.currentAnalysis.quadrant === 'Plan' ? '重要不紧急 (Plan)' : state.currentAnalysis.quadrant === 'Delegate' ? '不重要紧急 (Delegate)' : '不重要不紧急 (Eliminate)'}
                </h3>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700">
                   <p className="text-slate-700 dark:text-slate-300 italic text-lg leading-relaxed">"{state.currentAnalysis.reasoning}"</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
                  <h4 className="text-sm font-bold uppercase text-blue-600 dark:text-blue-400 mb-4 flex items-center gap-2 tracking-wider"><Terminal className="w-4 h-4" /> 执行路径</h4>
                  <ul className="space-y-4">
                    {state.currentAnalysis.steps.map((step, i) => (
                      <li key={i} className="flex gap-3 text-base text-slate-700 dark:text-slate-300">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0 border border-blue-200 dark:border-blue-500/20">{i+1}</span>
                        <span className="leading-snug">{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
                  <h4 className="text-sm font-bold uppercase text-fuchsia-600 dark:text-fuchsia-400 mb-4 flex items-center gap-2 tracking-wider"><BrainCircuit className="w-4 h-4" /> 智能建议</h4>
                  <p className="text-base text-slate-700 dark:text-slate-300 leading-relaxed">{state.currentAnalysis.advice}</p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row justify-end gap-4 pt-6 border-t border-slate-100 dark:border-slate-700/50">
                 <Button variant="outline" onClick={startNewTask} className="w-full md:w-auto"><RotateCcw className="w-5 h-5 mr-2 inline" /> 重新评估</Button>
                 <Button onClick={handleSaveTask} className="w-full md:w-auto"><Save className="w-5 h-5 mr-2 inline" /> 存入矩阵</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0f172a] text-slate-900 dark:text-slate-200 flex flex-col selection:bg-blue-500/30 font-sans antialiased transition-colors duration-300">
      {/* Header */}
      <header className="w-full border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0f172a]/95 backdrop-blur-sm sticky top-0 z-40 transition-colors duration-300">
        <div className="w-full px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigateTo('dashboard')}>
            <div className="bg-gradient-to-br from-blue-600 to-cyan-500 p-2 rounded-lg shadow-lg shadow-blue-500/20">
               <BrainCircuit className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div>
               <h1 className="text-lg md:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">
                MATRIX <span className="text-blue-600 dark:text-blue-400">AI</span>
              </h1>
              <span className="text-[9px] md:text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Strategy System</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button 
               onClick={toggleTheme}
               className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
               title="Toggle Theme"
             >
               {state.theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
             </button>
             {state.view !== 'settings' && (
               <button 
                onClick={() => navigateTo('settings')}
                className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
               </button>
             )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full p-4 md:p-6 max-w-[1920px] mx-auto">
        {state.view === 'dashboard' ? renderDashboard() : 
         state.view === 'wizard' ? renderWizard() : 
         state.view === 'stats' ? renderStats() :
         renderSettings()}
      </main>
    </div>
  );
};

export default App;
