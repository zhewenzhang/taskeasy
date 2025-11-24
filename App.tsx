
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AppState, TaskInput, Question, Task, UserSettings, QuadrantType } from './types';
import { generateAssessmentQuestions, analyzeTaskWithGemini, testAIConnection } from './services/geminiService';
import { supabaseService } from './services/supabaseService';
import { Button, Card, InputField, TextArea } from './components/UiComponents';
import { Matrix } from './components/Matrix';
import { BrainCircuit, ArrowRight, RotateCcw, Terminal, Plus, X, LayoutGrid, ListTodo, Save, CalendarDays, Settings, Database, UserCog, KeyRound, Cloud, PieChart, CheckCircle, Circle, Activity, BarChart3, Sun, Moon, ChevronLeft, Trash2, Cpu, Zap, Sliders, HelpCircle, ExternalLink, Box, Sparkles, Info, Edit, XCircle } from 'lucide-react';

const DEFAULT_SETTINGS: UserSettings = {
  aiProvider: 'gemini',
  geminiApiKey: "",
  aiModel: 'flash',
  siliconFlowApiKey: "",
  siliconFlowModel: "deepseek-ai/DeepSeek-V3",
  creativity: 0.7,
  customPrompt: "",
  userContext: "",
  supabaseUrl: "https://uwvlduprxppwdkjkvwby.supabase.co",
  supabaseKey: "sb_publishable_NCyVuDM0d_Nkn50QvKdY-Q_OCQJsN5L"
};

const THINKING_MESSAGES = [
  "正在深度拆解任务结构...",
  "正在检索匹配的思维模型...",
  "正在评估执行风险与机会...",
  "正在生成最佳执行策略...",
  "正在完善行动步骤细节..."
];

// --- Helper for Heatmap ---
const formatDateKey = (date: Date) => {
  return date.toISOString().split('T')[0];
};

const getIntensityClass = (count: number) => {
  // GitHub Dark Mode Colors
  if (count === 0) return 'bg-slate-100 dark:bg-[#161b22]'; // Empty (Light: Slate, Dark: GitHub Gray)
  if (count <= 1) return 'bg-[#9be9a8] dark:bg-[#0e4429]'; // Level 1
  if (count <= 2) return 'bg-[#40c463] dark:bg-[#006d32]'; // Level 2
  if (count <= 4) return 'bg-[#30a14e] dark:bg-[#26a641]'; // Level 3
  return 'bg-[#216e39] dark:bg-[#39d353]';                // Level 4
};

const Heatmap: React.FC<{ tasks: Task[], onDayClick: (date: string, tasks: Task[]) => void }> = ({ tasks, onDayClick }) => {
  
  const currentYear = new Date().getFullYear();

  // Generate weeks for the current year (Jan 1 to Dec 31)
  const weeks = useMemo(() => {
    const w = [];
    
    // Start from Jan 1st of current year
    const start = new Date(currentYear, 0, 1);
    // End at Dec 31st of current year
    const end = new Date(currentYear, 11, 31);
    
    // Align start to the previous Monday (to match rows Mon-Sun)
    // 0 = Sun, 1 = Mon, ...
    const dayOfWeek = start.getDay();
    // If Mon(1), diff is 0. If Sun(0), diff is -6. If Tue(2), diff is -1.
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    // Initialize current pointer to the Monday of the first week
    const current = new Date(start);
    current.setDate(start.getDate() + diff);

    // Generate weeks until we cover the entire year
    while (current <= end) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      w.push(week);
    }
    return w;
  }, [currentYear]);

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach(t => {
      const dateKey = formatDateKey(new Date(t.createdAt));
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(t);
    });
    return map;
  }, [tasks]);

  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="w-full overflow-x-auto custom-scrollbar pb-2">
      <div className="flex flex-col gap-2 min-w-max">
        
        {/* Month Labels & Grid Container */}
        <div className="flex gap-2">
           {/* Y-Axis Labels (Days) */}
           <div className="flex flex-col justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono pt-8 pb-2 pr-2 h-[110px]">
              <span>Mon</span>
              <span>Wed</span>
              <span>Fri</span>
           </div>

           <div className="flex flex-col">
              {/* X-Axis Labels (Months) */}
              <div className="flex gap-[3px] mb-2 h-4 relative">
                 {weeks.map((week, i) => {
                    const firstDay = week[0];
                    
                    // Skip label if it belongs to previous year (prevent 'Dec' showing at start)
                    if (firstDay.getFullYear() < currentYear) return null;

                    const prevWeek = weeks[i-1];
                    const isNewMonth = !prevWeek || prevWeek[0].getMonth() !== firstDay.getMonth();
                    const monthName = MONTH_LABELS[firstDay.getMonth()];
                    
                    // Only show label if there is enough space (skip if it's the very last week to avoid overflow)
                    if (isNewMonth && i < weeks.length - 2) {
                       return (
                          <div key={i} className="absolute text-[10px] text-slate-400 dark:text-slate-500 font-mono" style={{ left: `${i * 13}px` }}>
                            {monthName}
                          </div>
                       );
                    }
                    return null;
                 })}
              </div>

              {/* Heatmap Grid */}
              <div className="flex gap-[3px]">
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-[3px]">
                    {week.map((date, dayIndex) => {
                       const key = formatDateKey(date);
                       const dayTasks = tasksByDate[key] || [];
                       const count = dayTasks.length;
                       
                       // Quadrant Breakdown for Tooltip
                       const doCount = dayTasks.filter(t => t.quadrant === QuadrantType.DO).length;
                       const planCount = dayTasks.filter(t => t.quadrant === QuadrantType.PLAN).length;
                       
                       return (
                          <div 
                            key={key}
                            className={`w-[10px] h-[10px] rounded-[2px] cursor-pointer transition-colors hover:ring-1 hover:ring-slate-400 dark:hover:ring-white/50 relative group ${getIntensityClass(count)}`}
                            onClick={() => onDayClick(key, dayTasks)}
                            title={`${key}: ${count} tasks`}
                          >
                             {/* Simple Tooltip on Hover */}
                             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-50 pointer-events-none">
                                <div className="bg-slate-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-xl border border-slate-700">
                                   <span className="font-bold text-slate-300">{key}</span>
                                   <span className="mx-1 opacity-50">|</span>
                                   {count > 0 ? `${count} Tasks` : 'No tasks'}
                                </div>
                             </div>
                          </div>
                       );
                    })}
                  </div>
                ))}
              </div>
           </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-2 text-xs text-slate-400 dark:text-slate-500 mt-1 mr-4">
          <span>Less</span>
          <div className="w-[10px] h-[10px] bg-slate-100 dark:bg-[#161b22] rounded-[2px]"></div>
          <div className="w-[10px] h-[10px] bg-[#9be9a8] dark:bg-[#0e4429] rounded-[2px]"></div>
          <div className="w-[10px] h-[10px] bg-[#40c463] dark:bg-[#006d32] rounded-[2px]"></div>
          <div className="w-[10px] h-[10px] bg-[#30a14e] dark:bg-[#26a641] rounded-[2px]"></div>
          <div className="w-[10px] h-[10px] bg-[#216e39] dark:bg-[#39d353] rounded-[2px]"></div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  // Load state from local storage
  const [state, setState] = useState<AppState>(() => {
    const savedTasks = localStorage.getItem('matrix_ai_tasks');
    const savedSettings = localStorage.getItem('matrix_ai_settings');
    const savedTheme = localStorage.getItem('matrix_ai_theme') as 'light' | 'dark' || 'dark';
    
    const parsedSettings = savedSettings ? JSON.parse(savedSettings) : {};
    
    // Merge logic: Use defaults, then overwrite with saved, but ensure critical defaults are present if empty
    const mergedSettings = { ...DEFAULT_SETTINGS, ...parsedSettings };
    
    // Force use default Supabase config if local setting is empty/missing
    if (!mergedSettings.supabaseUrl) mergedSettings.supabaseUrl = DEFAULT_SETTINGS.supabaseUrl;
    if (!mergedSettings.supabaseKey) mergedSettings.supabaseKey = DEFAULT_SETTINGS.supabaseKey;
    
    // Ensure AI provider defaults
    if (!mergedSettings.siliconFlowModel) mergedSettings.siliconFlowModel = "deepseek-ai/DeepSeek-V3";
    if (!mergedSettings.aiProvider) mergedSettings.aiProvider = "gemini";

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
      settings: mergedSettings,
      isSyncing: false
    };
  });

  const [isLoading, setIsLoading] = useState(false);
  const [inputName, setInputName] = useState('');
  const [inputTime, setInputTime] = useState(''); 
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [thinkingStep, setThinkingStep] = useState(0);

  // Edit State
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editForm, setEditForm] = useState<{name: string, estimatedTime: string, quadrant: QuadrantType} | null>(null);

  // Stats Heatmap State
  const [selectedDateTasks, setSelectedDateTasks] = useState<{ date: string, tasks: Task[] } | null>(null);

  // Temp state for settings form
  const [tempSettings, setTempSettings] = useState<UserSettings>(state.settings);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [aiConnectionStatus, setAiConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');

  const isSupabaseConfigured = !!(state.settings.supabaseUrl && state.settings.supabaseKey);

  // --- Effects ---

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(state.theme);
    localStorage.setItem('matrix_ai_theme', state.theme);
  }, [state.theme]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (state.wizardStep === 'analyzing') {
      setThinkingStep(0);
      interval = setInterval(() => {
        setThinkingStep(prev => (prev + 1) % THINKING_MESSAGES.length);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [state.wizardStep]);

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
    setIsEditingTask(false);
  };

  const navigateTo = (view: 'dashboard' | 'wizard' | 'settings' | 'stats') => {
    if (view === 'settings') {
      setTempSettings(state.settings);
      setConnectionStatus('idle');
      setAiConnectionStatus('idle');
    }
    setState(prev => ({ ...prev, view, error: null }));
    setIsEditingTask(false);
  };

  const selectTask = (task: Task) => {
    setSelectedTask(task);
    setIsEditingTask(false);
  };

  // --- Edit Actions ---

  const startEditing = (task: Task) => {
    setEditForm({
      name: task.name,
      estimatedTime: task.estimatedTime,
      quadrant: task.quadrant
    });
    setIsEditingTask(true);
  };

  const cancelEditing = () => {
    setIsEditingTask(false);
    setEditForm(null);
  };

  const saveTaskChanges = async () => {
    if (!selectedTask || !editForm) return;

    const updatedTask = {
      ...selectedTask,
      name: editForm.name,
      estimatedTime: editForm.estimatedTime,
      quadrant: editForm.quadrant
    };

    // Optimistic Update
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === updatedTask.id ? updatedTask : t)
    }));
    setSelectedTask(updatedTask);
    setIsEditingTask(false);

    if (isSupabaseConfigured) {
      try {
        await supabaseService.updateTask(updatedTask.id, {
          name: updatedTask.name,
          estimatedTime: updatedTask.estimatedTime,
          quadrant: updatedTask.quadrant
        }, state.settings);
      } catch (error) {
        console.error("Failed to update task:", error);
        setState(prev => ({ ...prev, error: "更新失败，请重试" }));
      }
    }
  };

  const deleteTask = async (taskId: string) => {
    const previousTasks = state.tasks;
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.filter(t => t.id !== taskId)
    }));
    if (selectedTask?.id === taskId) {
       setSelectedTask(null);
       setIsEditingTask(false);
    }
    if (selectedDateTasks) {
       setSelectedDateTasks(prev => prev ? ({...prev, tasks: prev.tasks.filter(t => t.id !== taskId)}) : null);
    }

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
    // Update modal list if open
    if (selectedDateTasks) {
       setSelectedDateTasks(prev => prev ? ({...prev, tasks: prev.tasks.map(t => t.id === task.id ? updatedTask : t)}) : null);
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

  const handleTestAIConnection = async () => {
    setAiConnectionStatus('testing');
    const success = await testAIConnection(tempSettings);
    setAiConnectionStatus(success ? 'success' : 'failed');
  }

  const setDateOffset = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const dateString = date.toISOString().split('T')[0];
    setInputTime(dateString);
  };

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

  const renderTaskDetail = (task: Task, isOverlay: boolean = false) => {
    // Shared Action Buttons Component
    const ActionButtons = () => (
      <div className="flex items-center gap-1">
        {isEditingTask ? (
          <>
            <button 
              onClick={saveTaskChanges} 
              className="p-2 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
              title="保存"
            >
              <Save className="w-5 h-5" />
            </button>
            <button 
              onClick={cancelEditing} 
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="取消编辑"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </>
        ) : (
          <>
            <button 
              onClick={() => startEditing(task)} 
              className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
              title="编辑任务"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button 
              onClick={() => deleteTask(task.id)} 
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
              title="删除任务"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => { setSelectedTask(null); setIsEditingTask(false); }} 
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="关闭详情"
            >
              <X className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    );

    return (
      <Card 
        title={isOverlay ? (isEditingTask ? "编辑任务" : "任务详情") : undefined} 
        actions={isOverlay ? <ActionButtons /> : undefined}
        className={`h-full border-t-4 border-t-blue-500 flex flex-col shadow-2xl ${!isOverlay ? 'border-slate-200 dark:border-slate-700 relative' : 'min-h-0'}`}
      >
        {/* Desktop Absolute Actions */}
        {!isOverlay && (
          <div className="absolute top-3 right-3 z-10">
             <ActionButtons />
          </div>
        )}

        {/* Editing Mode Header */}
        {isEditingTask && editForm ? (
          <div className={`mb-6 ${!isOverlay ? 'mt-2 pr-20' : 'mt-2'}`}>
             <label className="block text-xs font-bold text-slate-400 uppercase mb-1">任务名称</label>
             <input 
                value={editForm.name}
                onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                className="w-full text-xl font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
             />
          </div>
        ) : (
          <div className={`flex justify-between items-start mb-6 ${!isOverlay ? 'mt-2 pr-20' : 'mt-2'}`}>
            <h3 className={`text-xl font-bold leading-tight ${task.isCompleted ? 'text-slate-400 line-through decoration-slate-400' : 'text-slate-900 dark:text-white'}`}>{task.name}</h3>
          </div>
        )}
        
        <div className="space-y-6 text-sm flex-1 overflow-y-auto custom-scrollbar pr-1 pb-6 min-h-0">
          {!isEditingTask && (
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
          )}

          {isEditingTask && editForm ? (
             <div className="grid grid-cols-1 gap-6">
                {/* Edit Quadrant */}
                <div>
                   <label className="block text-xs font-bold text-slate-400 uppercase mb-2">优先级 / 象限</label>
                   <div className="grid grid-cols-2 gap-3">
                      {[
                        { type: QuadrantType.DO, label: "Do (马上做)", color: "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" },
                        { type: QuadrantType.PLAN, label: "Plan (计划做)", color: "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300" },
                        { type: QuadrantType.DELEGATE, label: "Delegate (授权)", color: "border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300" },
                        { type: QuadrantType.ELIMINATE, label: "Eliminate (减少)", color: "border-rose-500 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300" }
                      ].map((q) => (
                         <button
                            key={q.type}
                            onClick={() => setEditForm({...editForm, quadrant: q.type})}
                            className={`p-3 rounded-lg border-2 text-xs font-bold transition-all ${editForm.quadrant === q.type ? q.color : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-400'}`}
                         >
                            {q.label}
                         </button>
                      ))}
                   </div>
                </div>

                {/* Edit Date */}
                <div>
                   <label className="block text-xs font-bold text-slate-400 uppercase mb-2">截止日期</label>
                   <input 
                      type="date"
                      value={editForm.estimatedTime}
                      onChange={(e) => setEditForm({...editForm, estimatedTime: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                   />
                </div>

                {isOverlay && (
                   <div className="flex gap-3 mt-4">
                      <Button onClick={saveTaskChanges} className="flex-1">保存</Button>
                      <Button variant="secondary" onClick={cancelEditing} className="flex-1">取消</Button>
                   </div>
                )}
             </div>
          ) : (
            /* View Mode Details */
            <>
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
                <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-3 uppercase tracking-wider font-bold flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                  <BrainCircuit className="w-4 h-4" /> 智能建议与策略
                </div>
                <div className="text-slate-900 dark:text-indigo-100 text-sm leading-relaxed bg-indigo-50/80 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-200 dark:border-indigo-700/50 shadow-sm">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                    <span className="whitespace-pre-wrap font-medium dark:font-normal">{task.advice}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
    );
  };

  // --- Views ---

  const renderDashboard = () => (
    <div className="w-full animate-in fade-in duration-500 flex flex-col min-h-full pb-10">
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 px-1 gap-4 shrink-0">
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
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 md:gap-8 relative items-start">
        {/* Matrix Section */}
        <div className={`${selectedTask ? 'lg:col-span-3' : 'lg:col-span-4'} transition-all duration-500 ease-in-out`}>
          <Matrix tasks={state.tasks} onTaskClick={selectTask} />
        </div>

        {/* Desktop Sidebar Task Detail - Sticky Position */}
        {selectedTask && (
          <div className="hidden lg:block lg:col-span-1 sticky top-24 self-start h-[calc(100vh-120px)] rounded-xl animate-in slide-in-from-right-8 fade-in duration-300 shadow-2xl shadow-slate-200/50 dark:shadow-none">
            {renderTaskDetail(selectedTask)}
          </div>
        )}
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
          <div className="absolute inset-0 -z-10" onClick={() => { setSelectedTask(null); setIsEditingTask(false); }}></div>
        </div>
      )}
    </div>
  );

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
       <div className="w-full h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
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

          {/* Top Row: Summary Cards */}
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

          {/* Middle Row: Quadrant & Heatmap */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
             {/* Quadrant Distribution (1/3 Width) */}
             <Card className="lg:col-span-1" title="象限分布概览" actions={<PieChart className="w-5 h-5 text-slate-400" />}>
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

             {/* Heatmap Section (2/3 Width) */}
             <Card className="lg:col-span-2" title="每日任务热力图" actions={<CalendarDays className="w-5 h-5 text-slate-400" />}>
               <div className="pt-2 w-full overflow-hidden">
                  <p className="text-sm text-slate-500 mb-4">
                    点击方块查看详情。颜色代表任务密度。
                  </p>
                  <div className="w-full overflow-x-auto custom-scrollbar">
                    <Heatmap 
                      tasks={state.tasks} 
                      onDayClick={(date, tasks) => setSelectedDateTasks({date, tasks})}
                    />
                  </div>
               </div>
             </Card>
          </div>

          {/* Bottom Row: Analysis Advice (Full Width) */}
          <div className="mb-8">
             <Card title="分析建议" actions={<BarChart3 className="w-5 h-5 text-slate-400" />}>
               <div className="flex items-center justify-center h-full border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/30 min-h-[150px]">
                  <p className="text-slate-500 dark:text-slate-500 text-sm italic text-center px-8">
                     {total > 0 
                       ? "数据分析模块已激活。建议优先处理 'Do' 象限任务，并为 'Plan' 象限任务预留大块时间。" 
                       : "暂无足够数据生成深度建议。请先添加并评估几个任务。"
                     }
                  </p>
               </div>
             </Card>
          </div>

          {/* Daily Detail Modal */}
          {selectedDateTasks && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                <div className="w-full max-w-md bg-white dark:bg-[#1e293b] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                   <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                        <CalendarDays className="w-5 h-5 text-blue-500" /> {selectedDateTasks.date}
                      </h3>
                      <button onClick={() => setSelectedDateTasks(null)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                         <X className="w-5 h-5 text-slate-500" />
                      </button>
                   </div>
                   <div className="p-4 overflow-y-auto custom-scrollbar space-y-3">
                      {selectedDateTasks.tasks.length === 0 ? (
                        <p className="text-center text-slate-500 py-8 italic">当天无任务记录</p>
                      ) : (
                        selectedDateTasks.tasks.map(task => (
                          <div key={task.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                             <div className="flex flex-col gap-1">
                               <span className={`font-medium text-sm ${task.isCompleted ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                 {task.name}
                               </span>
                               <span className={`text-[10px] px-2 py-0.5 rounded-full w-fit border ${
                                  task.quadrant === QuadrantType.DO ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                  task.quadrant === QuadrantType.PLAN ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                  task.quadrant === QuadrantType.DELEGATE ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-rose-100 text-rose-700 border-rose-200'
                               }`}>
                                 {task.quadrant}
                               </span>
                             </div>
                             <div className="flex items-center gap-2">
                                <button onClick={() => toggleTaskCompletion(task)} className={`p-1.5 rounded-md ${task.isCompleted ? 'text-emerald-500 bg-emerald-50' : 'text-slate-400 hover:text-emerald-500 hover:bg-slate-100'}`}>
                                   <CheckCircle className="w-4 h-4" />
                                </button>
                                <button onClick={() => deleteTask(task.id)} className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50">
                                   <Trash2 className="w-4 h-4" />
                                </button>
                             </div>
                          </div>
                        ))
                      )}
                   </div>
                </div>
                <div className="absolute inset-0 -z-10" onClick={() => setSelectedDateTasks(null)}></div>
             </div>
          )}
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
        {/* AI Configuration */}
        <Card title="AI 服务提供商配置" actions={<Cpu className="text-blue-500 dark:text-blue-400 w-5 h-5" />}>
          <div className="space-y-6">
            
            {/* Provider Selection Tabs */}
            <div className="grid grid-cols-2 gap-4 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
              <button 
                onClick={() => setTempSettings({...tempSettings, aiProvider: 'gemini'})}
                className={`flex flex-col items-center justify-center py-3 rounded-md text-sm font-medium transition-all ${tempSettings.aiProvider === 'gemini' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                 <span className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Google Gemini</span>
              </button>
              <button 
                onClick={() => setTempSettings({...tempSettings, aiProvider: 'siliconflow'})}
                 className={`flex flex-col items-center justify-center py-3 rounded-md text-sm font-medium transition-all ${tempSettings.aiProvider === 'siliconflow' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                 <span className="flex items-center gap-2"><Zap className="w-4 h-4" /> SiliconFlow</span>
              </button>
            </div>

            {/* Gemini Settings */}
            {tempSettings.aiProvider === 'gemini' && (
               <div className="space-y-5 animate-in fade-in">
                  <InputField 
                    label="Gemini API Key" 
                    type="password" 
                    placeholder="AIzaSy..." 
                    value={tempSettings.geminiApiKey}
                    onChange={(e) => setTempSettings({...tempSettings, geminiApiKey: e.target.value})}
                  />
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-4 flex gap-3">
                     <HelpCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                     <div className="text-sm text-blue-800 dark:text-blue-200">
                        <p className="font-semibold mb-1">如何获取 Key?</p>
                        <p className="mb-2">访问 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-blue-600">Google AI Studio</a> 创建免费 API Key。</p>
                        <p className="text-xs opacity-80">注意：免费版有频率限制 (RPM)，如遇报错请稍候再试。</p>
                     </div>
                  </div>
               </div>
            )}

            {/* SiliconFlow Settings */}
            {tempSettings.aiProvider === 'siliconflow' && (
               <div className="space-y-5 animate-in fade-in">
                  <InputField 
                    label="SiliconFlow API Key" 
                    type="password" 
                    placeholder="sk-..." 
                    value={tempSettings.siliconFlowApiKey}
                    onChange={(e) => setTempSettings({...tempSettings, siliconFlowApiKey: e.target.value})}
                  />
                  <InputField 
                    label="Model Name (Optional)" 
                    type="text" 
                    placeholder="deepseek-ai/DeepSeek-V3" 
                    value={tempSettings.siliconFlowModel}
                    helperText="默认为 deepseek-ai/DeepSeek-V3，支持 Qwen/DeepSeek 系列"
                    onChange={(e) => setTempSettings({...tempSettings, siliconFlowModel: e.target.value})}
                  />
                  <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-lg p-4 flex gap-3">
                     <ExternalLink className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
                     <div className="text-sm text-purple-800 dark:text-purple-200">
                        <p className="font-semibold mb-1">关于 SiliconFlow</p>
                        <p>支持 DeepSeek V3、Qwen 2.5 等国产开源模型，速度快且部分免费。请前往 <a href="https://cloud.siliconflow.cn" target="_blank" className="underline font-bold">硅基流动官网</a> 注册获取 Key。</p>
                     </div>
                  </div>
               </div>
            )}

             <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">连通性测试</span>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleTestAIConnection}
                    isLoading={aiConnectionStatus === 'testing'}
                    className="!py-2 !text-sm"
                  >
                    {aiConnectionStatus === 'success' ? '连接成功' : aiConnectionStatus === 'failed' ? '连接失败' : '测试连接'}
                  </Button>
                </div>
            </div>
          </div>
        </Card>

        <Card title="个性化参数 (Prompt)" actions={<UserCog className="text-purple-500 dark:text-purple-400 w-5 h-5" />}>
          <TextArea 
            label="用户角色设定 (User Context)" 
            placeholder="例如：我是一名软件工程师，平时工作涉及很多会议和代码开发..."
            value={tempSettings.userContext}
            onChange={(e) => setTempSettings({...tempSettings, userContext: e.target.value})}
            helperText="让 AI 了解你的职业背景，生成的建议会更精准。"
          />
          <TextArea 
            label="高级指令 (System Prompt)" 
            placeholder="例如：请用更严厉的语气；或者请总是用结构化的方式回答..."
            value={tempSettings.customPrompt}
            onChange={(e) => setTempSettings({...tempSettings, customPrompt: e.target.value})}
            helperText="附加给 AI 的额外指令。"
          />
        </Card>
        
        {/* Supabase configuration hidden as requested since it is auto-configured */}
      </div>
    </div>
  );

  const renderWizard = () => {
    if (state.wizardStep === 'input') {
      return (
        <div className="max-w-xl mx-auto w-full animate-in fade-in slide-in-from-bottom-8 duration-500">
          <div className="text-center mb-8 md:mb-10">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-500/10">
              <Terminal className="w-8 h-8" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">新任务评估</h2>
            <p className="text-slate-500 dark:text-slate-400">通过3个智能问题，AI 将帮你把任务放入正确的象限。</p>
          </div>
          <Card className="shadow-2xl shadow-slate-200/50 dark:shadow-none border-0 ring-1 ring-slate-200 dark:ring-slate-700">
            <InputField 
              label="任务名称" 
              placeholder="例如：完成 Q3 季度报告" 
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              autoFocus
            />
            <InputField 
              label="截止日期" 
              type="date" 
              value={inputTime}
              onChange={(e) => setInputTime(e.target.value)}
            />
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
              {[0, 1, 3, 7].map(days => (
                <button 
                  key={days}
                  onClick={() => setDateOffset(days)}
                  className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full transition-colors whitespace-nowrap"
                >
                  {days === 0 ? '今天' : days === 1 ? '明天' : `+${days}天`}
                </button>
              ))}
            </div>

            {state.error && (
              <div className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 p-4 rounded-lg text-sm mb-6 flex items-center gap-2">
                <Activity className="w-4 h-4" /> {state.error}
              </div>
            )}

            <Button 
              className="w-full text-lg h-12 shadow-xl shadow-blue-500/20" 
              onClick={handleStartAssessment} 
              disabled={!inputName || !inputTime}
              isLoading={isLoading}
            >
               开始评估 <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Card>
          <div className="text-center mt-8">
            <button onClick={() => navigateTo('dashboard')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-medium transition-colors">
              返回看板
            </button>
          </div>
        </div>
      );
    }

    if (state.wizardStep === 'assessment') {
      return (
        <div className="max-w-xl mx-auto w-full animate-in fade-in slide-in-from-right-8 duration-500">
           <div className="flex items-center justify-between mb-6">
             <h2 className="text-2xl font-bold text-slate-900 dark:text-white">任务评估</h2>
             <span className="text-sm font-mono bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-slate-500">AI Generated</span>
           </div>
           
           <div className="space-y-4 mb-8">
             {state.currentQuestions.map((q, idx) => (
               <div key={q.id} className="bg-white dark:bg-[#1e293b] p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all duration-300">
                 <div className="flex justify-between items-center gap-4">
                   <span className="font-medium text-lg text-slate-800 dark:text-slate-200 leading-relaxed">{q.text}</span>
                   <div className="flex gap-2 shrink-0">
                     <button 
                       onClick={() => toggleAnswer(idx.toString(), true)}
                       className={`w-12 h-12 rounded-lg font-bold transition-all flex items-center justify-center border-2
                         ${state.currentAnswers[idx.toString()] === true 
                           ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/30 scale-105' 
                           : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:border-blue-300'}`}
                     >
                       是
                     </button>
                     <button 
                       onClick={() => toggleAnswer(idx.toString(), false)}
                       className={`w-12 h-12 rounded-lg font-bold transition-all flex items-center justify-center border-2
                         ${state.currentAnswers[idx.toString()] === false 
                           ? 'bg-slate-700 border-slate-700 text-white shadow-lg scale-105' 
                           : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-400'}`}
                     >
                       否
                     </button>
                   </div>
                 </div>
               </div>
             ))}
           </div>

           {state.error && (
              <div className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 p-4 rounded-lg text-sm mb-6">
                {state.error}
              </div>
           )}

           <div className="flex gap-4">
              <Button variant="secondary" onClick={() => setState(prev => ({ ...prev, wizardStep: 'input' }))} className="flex-1">
                上一步
              </Button>
              <Button 
                className="flex-[2] text-lg shadow-xl shadow-blue-500/20" 
                onClick={handleAnalyze}
                disabled={Object.keys(state.currentAnswers).length < state.currentQuestions.length}
                isLoading={isLoading}
              >
                <Sparkles className="w-5 h-5 mr-2" /> 生成决策分析
              </Button>
           </div>
        </div>
      );
    }

    if (state.wizardStep === 'analyzing') {
      return (
        <div className="max-w-md mx-auto w-full text-center pt-10 animate-in fade-in duration-700">
           <div className="relative w-32 h-32 mx-auto mb-8">
              <div className="absolute inset-0 border-4 border-slate-100 dark:border-slate-800 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <BrainCircuit className="w-12 h-12 text-blue-500 animate-pulse" />
              </div>
           </div>
           <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4 animate-pulse">
             AI 正在思考
           </h3>
           <div className="h-8 overflow-hidden relative">
             {THINKING_MESSAGES.map((msg, idx) => (
                <p 
                  key={idx} 
                  className={`absolute w-full text-slate-500 dark:text-slate-400 transition-all duration-500 transform
                    ${idx === thinkingStep ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
                  `}
                >
                  {msg}
                </p>
             ))}
           </div>
        </div>
      );
    }

    if (state.wizardStep === 'result' && state.currentAnalysis && state.currentTaskInput) {
      const previewTask: Task = {
        id: 'preview',
        name: state.currentTaskInput.name,
        estimatedTime: state.currentTaskInput.estimatedTime,
        createdAt: Date.now(),
        isCompleted: false,
        ...state.currentAnalysis
      };

      return (
        <div className="max-w-3xl mx-auto w-full h-full flex flex-col animate-in zoom-in-95 duration-300 pb-8">
           <div className="flex items-center justify-between mb-6">
             <h2 className="text-2xl font-bold text-slate-900 dark:text-white">分析报告</h2>
             <div className="flex gap-2">
                <Button variant="secondary" onClick={startNewTask}>
                  放弃
                </Button>
                <Button onClick={handleSaveTask} className="shadow-lg shadow-blue-500/20">
                  <Save className="w-4 h-4 mr-2" /> 保存到看板
                </Button>
             </div>
           </div>
           
           <div className="flex-1 overflow-hidden bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl relative">
             <div className="h-full p-6 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-start mb-6">
                   <h3 className="text-2xl font-bold leading-tight mr-2 text-slate-900 dark:text-white">{previewTask.name}</h3>
                   <span className={`px-4 py-1.5 rounded-full font-bold text-sm border ${
                      previewTask.quadrant === 'Do' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                      previewTask.quadrant === 'Plan' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                      previewTask.quadrant === 'Delegate' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-rose-100 text-rose-700 border-rose-200'
                   }`}>
                     {previewTask.quadrant}
                   </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                   <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-xl border border-slate-200 dark:border-slate-800">
                      <div className="text-xs text-slate-500 uppercase font-bold mb-2">分析理由</div>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{previewTask.reasoning}</p>
                   </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-xl border border-slate-200 dark:border-slate-800">
                      <div className="text-xs text-slate-500 uppercase font-bold mb-2">核心建议</div>
                      <p className="text-slate-800 dark:text-indigo-200 font-medium leading-relaxed">{previewTask.advice}</p>
                   </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
                   <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                     <ListTodo className="w-5 h-5 text-blue-500"/> 推荐执行步骤
                   </h4>
                   <div className="space-y-3">
                      {previewTask.steps.map((s, i) => (
                        <div key={i} className="flex items-start gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                           <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold shrink-0">{i+1}</span>
                           <span className="text-slate-700 dark:text-slate-300">{s}</span>
                        </div>
                      ))}
                   </div>
                </div>
             </div>
           </div>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0f172a] transition-colors duration-300 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/70 dark:bg-[#0f172a]/80 border-b border-slate-200 dark:border-slate-800">
        <div className="w-full px-4 md:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigateTo('dashboard')}>
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-2 rounded-lg shadow-lg shadow-blue-500/20">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
              Matrix <span className="font-light">AI</span>
            </h1>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
             <button 
               onClick={toggleTheme} 
               className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
             >
               {state.theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
             </button>
             <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>
             <button 
               onClick={() => navigateTo('settings')}
               className={`p-2 rounded-full transition-all ${state.view === 'settings' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'}`}
             >
               <Settings className="w-5 h-5" />
             </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full p-4 md:p-6 lg:p-8 relative">
        {state.view === 'dashboard' && renderDashboard()}
        {state.view === 'wizard' && (
           <div className="h-full flex flex-col justify-center py-10">
             {renderWizard()}
           </div>
        )}
        {state.view === 'settings' && renderSettings()}
        {state.view === 'stats' && renderStats()}
      </main>
    </div>
  );
};

export default App;
