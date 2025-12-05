import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AppState, TaskInput, Question, Task, UserSettings, QuadrantType, BatchTaskInput, BatchAnalysisResult, BilingualText } from './types';
import { generateAssessmentQuestions, analyzeTaskWithGemini, testAIConnection, generateBatchAssessmentQuestions, analyzeBatchTasks } from './services/geminiService';
import { supabaseService } from './services/supabaseService';
import { Button, Card, InputField, TextArea } from './components/UiComponents';
import { Matrix } from './components/Matrix';
import { BrainCircuit, ArrowRight, RotateCcw, Terminal, Plus, X, LayoutGrid, ListTodo, Save, CalendarDays, Settings, Database, UserCog, KeyRound, Cloud, PieChart, CheckCircle, Circle, Activity, BarChart3, Sun, Moon, ChevronLeft, Trash2, Cpu, Zap, Sliders, HelpCircle, ExternalLink, Box, Sparkles, Info, Edit, XCircle, Layers, CheckSquare, Languages, Archive, Filter, ListFilter, Clock, ArrowDownWideNarrow, ArrowUpNarrowWide, Timer, Zap as ZapIcon, Target, AlertCircle } from 'lucide-react';

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

const BATCH_THINKING_MESSAGES = [
  "正在批量扫描任务...",
  "正在横向对比重要性...",
  "正在生成矩阵分类...",
  "正在优化执行优先级..."
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
    const savedLang = localStorage.getItem('matrix_ai_lang') as 'zh' | 'en' || 'zh';
    
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
      language: savedLang,
      view: 'dashboard',
      wizardStep: 'input',
      currentTaskInput: null,
      currentQuestions: [],
      currentAnswers: {},
      currentAnalysis: null,
      error: null,
      tasks: savedTasks ? JSON.parse(savedTasks) : [],
      settings: mergedSettings,
      isSyncing: false,
      // Batch Defaults
      batchWizardStep: 'input',
      batchInputs: [],
      batchQuestions: {},
      batchAnswers: {},
      batchResults: []
    };
  });

  const [isLoading, setIsLoading] = useState(false);
  const [inputName, setInputName] = useState('');
  const [inputTime, setInputTime] = useState(''); 
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [thinkingStep, setThinkingStep] = useState(0);

  // Filter State - Default to 'active' instead of 'all'
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'completed'>('active');
  const [filterTimeRange, setFilterTimeRange] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Archive (Completed Tasks) View State
  const [archiveSort, setArchiveSort] = useState<'newest' | 'oldest' | 'duration-desc' | 'duration-asc'>('newest');
  const [archiveFilter, setArchiveFilter] = useState<QuadrantType | 'all'>('all');

  // Batch specific local state for input
  const [batchRawInput, setBatchRawInput] = useState('');
  const [batchCommonDate, setBatchCommonDate] = useState('');

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
    localStorage.setItem('matrix_ai_lang', state.language);
  }, [state.language]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (state.wizardStep === 'analyzing' || state.batchWizardStep === 'analyzing') {
      setThinkingStep(0);
      const messages = state.view === 'batch-wizard' ? BATCH_THINKING_MESSAGES : THINKING_MESSAGES;
      interval = setInterval(() => {
        setThinkingStep(prev => (prev + 1) % messages.length);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [state.wizardStep, state.batchWizardStep, state.view]);

  const refreshTasks = useCallback(async () => {
    if (isSupabaseConfigured) {
      setState(prev => ({ ...prev, isSyncing: true }));
      try {
        const tasks = await supabaseService.fetchTasks(state.settings);
        setState(prev => ({ ...prev, tasks, isSyncing: false }));
        localStorage.setItem('matrix_ai_tasks', JSON.stringify(tasks));
      } catch (error: any) {
        console.error("Failed to fetch from Supabase:", error);
        // Better error message handling
        const msg = error?.message || "无法连接数据库";
        setState(prev => ({ ...prev, isSyncing: false, error: `${msg}，已切换至本地缓存。` }));
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
  
  const toggleLanguage = () => {
    setState(prev => ({ ...prev, language: prev.language === 'zh' ? 'en' : 'zh' }));
  };

  const getLocalizedContent = (content: BilingualText | string | null | undefined): string => {
    if (!content) return "";
    if (typeof content === 'string') return content;
    return content[state.language] || content['cn'] || ""; // Fallback to CN
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

  const startBatchTask = () => {
    setState(prev => ({
       ...prev,
       view: 'batch-wizard',
       batchWizardStep: 'input',
       batchInputs: [],
       batchQuestions: {},
       batchAnswers: {},
       batchResults: [],
       error: null
    }));
    setBatchRawInput('');
    const today = new Date().toISOString().split('T')[0];
    setBatchCommonDate(today);
    setSelectedTask(null);
  };

  const navigateTo = (view: 'dashboard' | 'wizard' | 'batch-wizard' | 'settings' | 'stats' | 'completed-tasks') => {
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

  // --- Filter Logic ---
  const filteredTasks = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Helper to get start/end of current week (Monday start)
    const getWeekBounds = () => {
       const d = new Date();
       const day = d.getDay();
       const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
       const start = new Date(d.setDate(diff));
       start.setHours(0,0,0,0);
       
       const end = new Date(start);
       end.setDate(start.getDate() + 6);
       end.setHours(23,59,59,999);
       return { start, end };
    };
    
    const { start: weekStart, end: weekEnd } = getWeekBounds();

    return state.tasks.filter(task => {
       // 1. Status Filter
       if (filterStatus === 'active' && task.isCompleted) return false;
       if (filterStatus === 'completed' && !task.isCompleted) return false;

       // 2. Time Range Filter
       if (filterTimeRange === 'all') return true;
       
       const taskDateStr = task.estimatedTime; // YYYY-MM-DD
       if (!taskDateStr) return false; // Should have date

       if (filterTimeRange === 'today') {
          return taskDateStr === todayStr;
       }

       const taskDate = new Date(taskDateStr);
       // Reset task date time to avoid timezone issues when comparing just dates
       
       if (filterTimeRange === 'week') {
          // Check if date is within this week
          return taskDate >= weekStart && taskDate <= weekEnd;
       }

       if (filterTimeRange === 'month') {
          return taskDate.getMonth() === today.getMonth() && taskDate.getFullYear() === today.getFullYear();
       }

       if (filterTimeRange === 'custom') {
          if (filterStartDate && taskDateStr < filterStartDate) return false;
          if (filterEndDate && taskDateStr > filterEndDate) return false;
          return true;
       }

       return true;
    });
  }, [state.tasks, filterStatus, filterTimeRange, filterStartDate, filterEndDate]);


  // --- Archive Logic (Moved to Top Level to fix React Hook rules) ---
  
  // Process data based on local sort/filter state
  const processedCompletedTasks = useMemo(() => {
     let list = state.tasks.filter(t => t.isCompleted);
     
     // Filter
     if (archiveFilter !== 'all') {
        list = list.filter(t => t.quadrant === archiveFilter);
     }

     // Sort
     list.sort((a, b) => {
        // Ensure explicit number conversion to satisfy strict type checks
        const tA = Number(a.completedAt || 0);
        const tB = Number(b.completedAt || 0);
        const cA = Number(a.createdAt || 0);
        const cB = Number(b.createdAt || 0);
        
        const durA = tA - cA;
        const durB = tB - cB;

        switch (archiveSort) {
           case 'newest': return tB - tA;
           case 'oldest': return tA - tB;
           case 'duration-desc': return durB - durA;
           case 'duration-asc': return durA - durB;
           default: return 0;
        }
     });
     return list;
  }, [state.tasks, archiveSort, archiveFilter]);

  // Analytics Logic for Insights Panel
  const archiveInsights = useMemo(() => {
     if (processedCompletedTasks.length === 0) return { avgDuration: 0, primaryQuadrant: 'None' };

     // 1. Avg Duration
     const totalDuration = processedCompletedTasks.reduce((acc, t) => {
        if (t.completedAt && t.createdAt) {
           return acc + (Number(t.completedAt) - Number(t.createdAt));
        }
        return acc;
     }, 0);
     const avgDays = totalDuration / processedCompletedTasks.length / (1000 * 60 * 60 * 24);

     // 2. Primary Quadrant
     const counts = processedCompletedTasks.reduce((acc, t) => {
        acc[t.quadrant] = (acc[t.quadrant] || 0) + 1;
        return acc;
     }, {} as Record<string, number>);
     
     const primary = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

     return { avgDuration: avgDays.toFixed(1), primaryQuadrant: primary };
  }, [processedCompletedTasks]);


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
    // If Supabase settings changed, try to refresh tasks
    if (tempSettings.supabaseUrl && tempSettings.supabaseKey) {
      refreshTasks();
    }
  };

  const resetSettings = () => {
    setTempSettings(DEFAULT_SETTINGS);
    setConnectionStatus('idle');
    setAiConnectionStatus('idle');
  };

  const testSupabase = async () => {
    setConnectionStatus('testing');
    const success = await supabaseService.testConnection(tempSettings);
    setConnectionStatus(success ? 'success' : 'failed');
  };

  const testAI = async () => {
    setAiConnectionStatus('testing');
    const success = await testAIConnection(tempSettings);
    setAiConnectionStatus(success ? 'success' : 'failed');
  };

  // --- Single Wizard Handlers ---
  const handleTaskInputSubmit = async () => {
    if (!inputName.trim()) {
      setState(prev => ({ ...prev, error: "任务名称不能为空" }));
      return;
    }
    
    setIsLoading(true);
    setState(prev => ({ ...prev, error: null }));
    
    const taskInput = { name: inputName, estimatedTime: inputTime };
    
    try {
      const questions = await generateAssessmentQuestions(taskInput, state.settings);
      setState(prev => ({ 
        ...prev, 
        currentTaskInput: taskInput,
        currentQuestions: questions.map((q, i) => ({ id: String(i), text: q })),
        wizardStep: 'assessment',
        currentAnswers: {}
      }));
    } catch (error: any) {
      setState(prev => ({ ...prev, error: error.message || "生成问题失败，请检查设置" }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswerSubmit = async () => {
    if (!state.currentTaskInput) return;
    
    setState(prev => ({ ...prev, wizardStep: 'analyzing' }));
    
    try {
      const analysis = await analyzeTaskWithGemini(
        state.currentTaskInput, 
        state.currentQuestions.map(q => q.text),
        state.currentAnswers,
        state.settings
      );
      
      setState(prev => ({ 
        ...prev, 
        currentAnalysis: analysis,
        wizardStep: 'result'
      }));
    } catch (error: any) {
      setState(prev => ({ 
        ...prev, 
        error: error.message || "分析任务失败",
        wizardStep: 'assessment' 
      }));
    }
  };

  const handleSaveTask = async () => {
    if (!state.currentTaskInput || !state.currentAnalysis) return;
    
    setIsLoading(true);
    const newTask: Task = {
      id: crypto.randomUUID(),
      name: state.currentTaskInput.name,
      estimatedTime: state.currentTaskInput.estimatedTime,
      createdAt: Date.now(),
      ...state.currentAnalysis,
    };
    
    // Optimistic Save
    setState(prev => ({
      ...prev,
      tasks: [...prev.tasks, newTask],
      view: 'dashboard',
      wizardStep: 'input',
      currentTaskInput: null
    }));

    if (isSupabaseConfigured) {
      try {
        await supabaseService.addTask(newTask, state.settings);
      } catch (error) {
         console.error("Failed to save to DB:", error);
         setState(prev => ({ ...prev, error: "保存到云端失败，仅保存到本地" }));
      }
    }
    setIsLoading(false);
  };

  // --- Batch Wizard Handlers ---

  const handleBatchInputSubmit = async () => {
    const lines = batchRawInput.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
      setState(prev => ({ ...prev, error: "请输入至少一个任务" }));
      return;
    }
    if (lines.length > 20) {
      setState(prev => ({ ...prev, error: "一次最多处理 20 个任务" }));
      return;
    }

    setIsLoading(true);
    setState(prev => ({ ...prev, error: null }));

    const batchTasks: BatchTaskInput[] = lines.map(line => ({
      id: crypto.randomUUID(), // Temp ID
      name: line,
      estimatedTime: batchCommonDate
    }));

    try {
      const questionsMap = await generateBatchAssessmentQuestions(batchTasks, state.settings);
      setState(prev => ({
        ...prev,
        batchInputs: batchTasks,
        batchQuestions: questionsMap,
        batchWizardStep: 'assessment',
        batchAnswers: {}
      }));
    } catch (error: any) {
      setState(prev => ({ ...prev, error: error.message || "生成批量问题失败" }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchAnswerSubmit = async () => {
    // Validation: Ensure all tasks have 3 answers
    const allAnswered = state.batchInputs.every(t => {
      const answers = state.batchAnswers[t.id];
      // Check indices 0, 1, 2 are present
      return answers && answers[0] !== undefined && answers[1] !== undefined && answers[2] !== undefined;
    });

    if (!allAnswered) {
      setState(prev => ({ ...prev, error: "请回答所有任务的问题" }));
      return;
    }

    setState(prev => ({ ...prev, batchWizardStep: 'analyzing', error: null }));

    try {
      const results = await analyzeBatchTasks(
        state.batchInputs,
        state.batchQuestions,
        state.batchAnswers,
        state.settings
      );
      
      setState(prev => ({
        ...prev,
        batchResults: results,
        batchWizardStep: 'review'
      }));
    } catch (error: any) {
      setState(prev => ({ ...prev, error: error.message || "批量分析失败", batchWizardStep: 'assessment' }));
    }
  };

  const handleBatchReviewSave = async () => {
    setIsLoading(true);
    const newTasks: Task[] = state.batchResults.map(res => {
      const originalInput = state.batchInputs.find(t => t.id === res.taskId);
      return {
        id: crypto.randomUUID(),
        name: originalInput ? originalInput.name : "Unknown Task",
        estimatedTime: originalInput ? originalInput.estimatedTime : batchCommonDate,
        createdAt: Date.now(),
        quadrant: res.quadrant,
        isImportant: res.quadrant === QuadrantType.DO || res.quadrant === QuadrantType.PLAN,
        isUrgent: res.quadrant === QuadrantType.DO || res.quadrant === QuadrantType.DELEGATE,
        reasoning: res.reasoning,
        steps: [], // Batch doesn't generate detailed steps to save tokens
        advice: res.advice
      };
    });

    // Optimistic Save
    setState(prev => ({
      ...prev,
      tasks: [...prev.tasks, ...newTasks],
      view: 'dashboard',
      batchWizardStep: 'input',
      batchInputs: []
    }));

    if (isSupabaseConfigured) {
      try {
        await Promise.all(newTasks.map(t => supabaseService.addTask(t, state.settings)));
      } catch (error) {
        console.error("Batch save error:", error);
        setState(prev => ({ ...prev, error: "部分任务同步云端失败" }));
      }
    }
    setIsLoading(false);
  };

  // --- Render Helpers ---

  const renderHeaderActions = (onEdit: () => void, onDelete: () => void, onClose: () => void, isEditing: boolean, onSave: () => void, onCancel: () => void) => (
    <div className="flex items-center gap-1 md:gap-2">
      {isEditing ? (
        <>
          <Button onClick={onSave} className="!px-3 !py-1.5 md:!px-4 md:!py-2 bg-emerald-600 hover:bg-emerald-700 text-xs md:text-sm">
            <Save className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-2" /> 保存
          </Button>
          <Button variant="secondary" onClick={onCancel} className="!px-3 !py-1.5 md:!px-4 md:!py-2 text-xs md:text-sm">
            取消
          </Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={onEdit} className="!px-3 !py-1.5 md:!px-4 md:!py-2 text-xs md:text-sm" title="编辑任务">
            <Edit className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden md:inline ml-1">编辑</span>
          </Button>
          <Button variant="danger" onClick={onDelete} className="!px-3 !py-1.5 md:!px-4 md:!py-2 text-xs md:text-sm" title="删除任务">
            <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden md:inline ml-1">删除</span>
          </Button>
          <button 
            onClick={onClose} 
            className="p-1.5 md:p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </>
      )}
    </div>
  );

  const renderTaskDetail = (task: Task | null, isOverlay = false) => {
    if (!task) return null;
    
    // Actions Wrapper
    const actions = renderHeaderActions(
      () => startEditing(task),
      () => deleteTask(task.id),
      () => {
        if (isOverlay) {
          setSelectedTask(null);
          if (selectedDateTasks) setSelectedDateTasks(null);
        } else {
          setSelectedTask(null);
        }
        setIsEditingTask(false);
      },
      isEditingTask,
      saveTaskChanges,
      cancelEditing
    );

    return (
      <Card 
        className={`${isOverlay ? 'h-[85vh] w-[90vw] md:w-[600px] shadow-2xl' : 'h-[calc(100vh-120px)] border-none shadow-none bg-transparent'} flex flex-col`}
        title={isOverlay ? "任务详情" : undefined}
        actions={isOverlay ? actions : undefined}
      >
        {/* Desktop Actions (Absolute Position) */}
        {!isOverlay && (
          <div className="absolute top-0 right-0 z-20 flex gap-2 bg-white/80 dark:bg-[#1e293b]/80 backdrop-blur-sm p-2 rounded-bl-xl border-l border-b border-slate-200 dark:border-slate-700">
             {actions}
          </div>
        )}

        <div className={`space-y-6 md:space-y-8 h-full overflow-y-auto custom-scrollbar pb-6 ${!isOverlay ? 'pt-2' : ''}`}>
          
          {/* Header Section */}
          <div>
            {isEditingTask ? (
              <div className="space-y-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-blue-100 dark:border-slate-700">
                <InputField 
                  label="任务名称" 
                  value={editForm?.name || ''} 
                  onChange={e => setEditForm(prev => prev ? {...prev, name: e.target.value} : null)} 
                />
                <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                   <div className="flex items-center gap-3">
                      <CalendarDays className="w-5 h-5 text-slate-400" />
                      <span className="text-sm font-medium">截止日期</span>
                   </div>
                   <input 
                      type="date" 
                      className="bg-transparent text-slate-700 dark:text-slate-200 font-mono text-sm focus:outline-none text-right"
                      value={editForm?.estimatedTime || ''}
                      onChange={e => setEditForm(prev => prev ? {...prev, estimatedTime: e.target.value} : null)}
                   />
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight mb-3">
                  {task.name}
                </h2>
                <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400 text-sm">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    <span className="font-mono">{task.estimatedTime}</span>
                  </div>
                  {task.isCompleted && (
                    <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded text-xs font-bold">
                      COMPLETED
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Action Button */}
          {!isEditingTask && (
            <Button 
              onClick={() => toggleTaskCompletion(task)}
              className={`w-full py-3 md:py-4 text-base md:text-lg font-bold rounded-xl transition-all duration-300 transform active:scale-[0.99]
                ${task.isCompleted 
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700' 
                  : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/30'
                }`}
            >
              {task.isCompleted ? (
                <span className="flex items-center justify-center gap-2"><RotateCcw className="w-5 h-5"/> 恢复为未完成</span>
              ) : (
                <span className="flex items-center justify-center gap-2"><CheckCircle className="w-5 h-5"/> 标记为已完成</span>
              )}
            </Button>
          )}

          {/* Quadrant Classification */}
          <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
             {isEditingTask ? (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-400 mb-3">优先权矩阵分类</label>
                  <div className="grid grid-cols-2 gap-3">
                     {[QuadrantType.DO, QuadrantType.PLAN, QuadrantType.DELEGATE, QuadrantType.ELIMINATE].map(q => (
                       <button
                         key={q}
                         onClick={() => setEditForm(prev => prev ? {...prev, quadrant: q} : null)}
                         className={`py-3 px-2 rounded-lg text-sm font-bold border-2 transition-all
                           ${editForm?.quadrant === q 
                             ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' 
                             : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-500'}
                         `}
                       >
                         {q}
                       </button>
                     ))}
                  </div>
                </div>
             ) : (
               <div className="flex items-center justify-between">
                 <span className="text-slate-500 dark:text-slate-400 font-medium text-sm md:text-base">优先级分类</span>
                 <span className={`px-4 py-1.5 rounded-full font-bold text-sm md:text-base tracking-wide
                    ${task.quadrant === QuadrantType.DO ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : ''}
                    ${task.quadrant === QuadrantType.PLAN ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : ''}
                    ${task.quadrant === QuadrantType.DELEGATE ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : ''}
                    ${task.quadrant === QuadrantType.ELIMINATE ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : ''}
                 `}>
                   {task.quadrant}
                 </span>
               </div>
             )}

             {/* Reasoning Text */}
             {!isEditingTask && (
               <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">分类逻辑</p>
                 <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm md:text-base italic">
                   "{getLocalizedContent(task.reasoning)}"
                 </p>
               </div>
             )}
          </div>

          {/* Steps */}
          {(!isEditingTask && Array.isArray(task.steps) && task.steps.length > 0) && (
            <div>
               <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-200 mb-4">
                 <ListTodo className="w-5 h-5 text-blue-500" /> 执行步骤
               </h3>
               <div className="space-y-3">
                 {task.steps.map((step, idx) => (
                   <div key={idx} className="flex gap-4 p-4 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs mt-0.5">
                        {idx + 1}
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 text-sm md:text-base leading-relaxed">
                        {getLocalizedContent(step)}
                      </p>
                   </div>
                 ))}
               </div>
            </div>
          )}

          {/* AI Advice */}
          {!isEditingTask && (
            <div>
               <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-200 mb-4">
                 <BrainCircuit className="w-5 h-5 text-purple-500" /> 智能建议与策略
               </h3>
               <div className="p-5 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/10 dark:to-indigo-900/10 rounded-2xl border border-purple-100 dark:border-purple-900/30 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-10">
                     <Sparkles className="w-16 h-16 text-purple-500" />
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed relative z-10 text-sm md:text-base">
                    {getLocalizedContent(task.advice)}
                  </p>
               </div>
            </div>
          )}
        </div>
      </Card>
    );
  };

  const renderDashboard = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 transition-all duration-300 ease-in-out">
      {/* Left Column: Task Matrix (Infinite Canvas) */}
      <div className={`${selectedTask ? 'lg:col-span-8' : 'lg:col-span-12'} flex flex-col min-h-0 transition-all duration-500 ease-in-out`}>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
                任务矩阵看板
              </span>
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1 flex items-center gap-2">
              Task Priority Matrix 
              {state.isSyncing ? (
                 <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse flex items-center gap-1">
                   <Cloud className="w-3 h-3" /> Syncing...
                 </span>
              ) : isSupabaseConfigured ? (
                 <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center gap-1">
                   <Cloud className="w-3 h-3" /> Sync On
                 </span>
              ) : (
                 <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 flex items-center gap-1">
                   <Database className="w-3 h-3" /> Local
                 </span>
              )}
            </p>
          </div>
          
          {/* Desktop Top Actions */}
          <div className="hidden md:flex gap-3">
             <Button variant="secondary" onClick={() => navigateTo('completed-tasks')} title="归档">
                <Archive className="w-5 h-5 mr-2" /> 历史归档
             </Button>
             <Button variant="secondary" onClick={() => navigateTo('stats')}>
                <BarChart3 className="w-5 h-5 mr-2" /> 数据分析
             </Button>
             <Button onClick={startNewTask} className="shadow-blue-500/20">
                <Plus className="w-5 h-5 mr-1" /> 新建任务
             </Button>
             <Button variant="secondary" onClick={startBatchTask} title="批量创建">
                <Layers className="w-5 h-5 text-indigo-500" />
             </Button>
          </div>

          {/* Mobile Header Icons */}
          <div className="md:hidden flex items-center gap-2">
            <button onClick={() => navigateTo('stats')} className="p-2 text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-lg">
               <BarChart3 className="w-5 h-5" />
            </button>
            <button onClick={() => navigateTo('completed-tasks')} className="p-2 text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-lg">
               <Archive className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setShowMobileFilters(!showMobileFilters)} 
              className={`p-2 rounded-lg relative ${showMobileFilters ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
            >
               <Filter className="w-5 h-5" />
               {(filterStatus !== 'active' || filterTimeRange !== 'all') && (
                 <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full"></span>
               )}
            </button>
          </div>
        </div>
        
        {/* Filter Toolbar (Collapsible on Mobile) */}
        <div className={`mb-6 flex flex-col md:flex-row gap-4 md:items-center bg-white dark:bg-slate-800/50 p-3 md:p-4 rounded-xl border border-slate-200 dark:border-slate-800 transition-all duration-300 ${showMobileFilters ? 'block' : 'hidden md:flex'}`}>
           <div className="flex items-center gap-2 text-sm text-slate-500 font-bold uppercase tracking-wider w-full md:w-auto">
             <ListFilter className="w-4 h-4" /> 过滤
           </div>
           
           <div className="grid grid-cols-1 md:flex gap-3 w-full">
             <select 
               value={filterStatus} 
               onChange={(e) => setFilterStatus(e.target.value as any)}
               className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
             >
               <option value="active">进行中 (未完成)</option>
               <option value="all">全部状态</option>
               <option value="completed">已完成</option>
             </select>

             <select 
               value={filterTimeRange} 
               onChange={(e) => setFilterTimeRange(e.target.value as any)}
               className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
             >
               <option value="all">所有时间</option>
               <option value="today">今天</option>
               <option value="week">本周</option>
               <option value="month">本月</option>
               <option value="custom">自定义范围...</option>
             </select>

             {filterTimeRange === 'custom' && (
                <div className="flex items-center gap-2">
                   <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-2 text-sm" />
                   <span className="text-slate-400">-</span>
                   <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-2 text-sm" />
                </div>
             )}
           </div>
        </div>

        <Matrix tasks={filteredTasks} onTaskClick={selectTask} />
      </div>

      {/* Right Column: Task Details (Sticky on Desktop) - Only show when selectedTask is active */}
      {selectedTask && (
        <div className="hidden lg:block lg:col-span-4 min-h-0 relative animate-in slide-in-from-right-8 fade-in duration-500">
          <div className="sticky top-6">
             {renderTaskDetail(selectedTask)}
          </div>
        </div>
      )}

      {/* Mobile Floating Action Buttons (FAB) */}
      <div className="md:hidden fixed bottom-6 right-6 flex flex-col gap-4 z-30 items-center">
        <button 
          onClick={startBatchTask}
          className="w-12 h-12 rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 flex items-center justify-center active:scale-90 transition-transform"
        >
          <Layers className="w-6 h-6" />
        </button>
        <button 
          onClick={startNewTask}
          className="w-12 h-12 rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/40 flex items-center justify-center active:scale-90 transition-transform"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>
    </div>
  );

  const renderCompletedTasks = () => {
    return (
      <div className="max-w-6xl mx-auto min-h-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white">已完成任务档案</h1>
            <p className="text-slate-500 dark:text-slate-400 font-mono text-sm">Completed Tasks Archive</p>
          </div>
          <Button variant="secondary" onClick={() => navigateTo('dashboard')} className="self-start md:self-auto">
             <ChevronLeft className="w-4 h-4 mr-1" /> 返回看板
          </Button>
        </div>

        {/* Insights Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
           <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl">
                 <CheckSquare className="w-6 h-6" />
              </div>
              <div>
                 <p className="text-xs text-slate-500 font-bold uppercase">归档总数</p>
                 <p className="text-2xl font-black text-slate-800 dark:text-white">{processedCompletedTasks.length}</p>
              </div>
           </div>
           <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-xl">
                 <Timer className="w-6 h-6" />
              </div>
              <div>
                 <p className="text-xs text-slate-500 font-bold uppercase">平均周转 (天)</p>
                 <p className="text-2xl font-black text-slate-800 dark:text-white">{archiveInsights.avgDuration}</p>
              </div>
           </div>
           <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-xl">
                 <Target className="w-6 h-6" />
              </div>
              <div>
                 <p className="text-xs text-slate-500 font-bold uppercase">核心产出领域</p>
                 <p className="text-xl font-black text-slate-800 dark:text-white">{archiveInsights.primaryQuadrant}</p>
              </div>
           </div>
        </div>

        {/* Control Toolbar */}
        <div className="flex flex-col md:flex-row gap-4 mb-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
           <div className="flex items-center gap-2 w-full md:w-auto">
              <ArrowDownWideNarrow className="w-4 h-4 text-slate-500" />
              <select 
                 value={archiveSort} 
                 onChange={(e) => setArchiveSort(e.target.value as any)}
                 className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-48"
              >
                 <option value="newest">最近完成 (Newest)</option>
                 <option value="oldest">最早完成 (Oldest)</option>
                 <option value="duration-desc">耗时最长 (Slowest)</option>
                 <option value="duration-asc">耗时最短 (Fastest)</option>
              </select>
           </div>
           <div className="flex items-center gap-2 w-full md:w-auto">
              <Filter className="w-4 h-4 text-slate-500" />
              <select 
                 value={archiveFilter} 
                 onChange={(e) => setArchiveFilter(e.target.value as any)}
                 className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-48"
              >
                 <option value="all">所有象限 (All Quadrants)</option>
                 <option value={QuadrantType.DO}>Do (马上做)</option>
                 <option value={QuadrantType.PLAN}>Plan (计划做)</option>
                 <option value={QuadrantType.DELEGATE}>Delegate (授权做)</option>
                 <option value={QuadrantType.ELIMINATE}>Eliminate (减少做)</option>
              </select>
           </div>
        </div>

        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">
           {/* Desktop Table View */}
           <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-xs uppercase font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4">任务名称</th>
                  <th className="px-6 py-4">所属象限</th>
                  <th className="px-6 py-4">截止日期</th>
                  <th className="px-6 py-4">完成日期</th>
                  <th className="px-6 py-4">耗时 (天)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {processedCompletedTasks.length === 0 ? (
                  <tr>
                     <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">暂无符合条件的已完成任务</td>
                  </tr>
                ) : (
                  processedCompletedTasks.map(task => {
                    const daysTaken = task.completedAt && task.createdAt 
                      ? Math.max(0, Math.ceil((Number(task.completedAt) - Number(task.createdAt)) / (1000 * 60 * 60 * 24))) 
                      : 0;
                    
                    return (
                      <tr key={task.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">{task.name}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-bold
                            ${task.quadrant === QuadrantType.DO ? 'bg-blue-100 text-blue-700' : ''}
                            ${task.quadrant === QuadrantType.PLAN ? 'bg-emerald-100 text-emerald-700' : ''}
                            ${task.quadrant === QuadrantType.DELEGATE ? 'bg-amber-100 text-amber-700' : ''}
                            ${task.quadrant === QuadrantType.ELIMINATE ? 'bg-rose-100 text-rose-700' : ''}
                          `}>
                            {task.quadrant}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-mono text-sm">{task.estimatedTime}</td>
                        <td className="px-6 py-4 text-slate-500 font-mono text-sm">
                           {task.completedAt ? new Date(task.completedAt).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-mono text-sm">{daysTaken} 天</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          
          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
             {processedCompletedTasks.length === 0 ? (
                <div className="p-8 text-center text-slate-400 italic">暂无符合条件的已完成任务</div>
             ) : (
                processedCompletedTasks.map(task => {
                   const daysTaken = task.completedAt && task.createdAt 
                     ? Math.max(0, Math.ceil((Number(task.completedAt) - Number(task.createdAt)) / (1000 * 60 * 60 * 24))) 
                     : 0;
                   return (
                      <div key={task.id} className="p-4 flex flex-col gap-3">
                         <div className="flex justify-between items-start">
                            <h3 className="font-bold text-slate-800 dark:text-slate-200 line-clamp-2">{task.name}</h3>
                            <span className={`flex-shrink-0 px-2 py-1 rounded text-xs font-bold ml-2
                               ${task.quadrant === QuadrantType.DO ? 'bg-blue-100 text-blue-700' : ''}
                               ${task.quadrant === QuadrantType.PLAN ? 'bg-emerald-100 text-emerald-700' : ''}
                               ${task.quadrant === QuadrantType.DELEGATE ? 'bg-amber-100 text-amber-700' : ''}
                               ${task.quadrant === QuadrantType.ELIMINATE ? 'bg-rose-100 text-rose-700' : ''}
                            `}>
                               {task.quadrant}
                            </span>
                         </div>
                         <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
                            <div className="flex flex-col">
                               <span className="opacity-60 text-[10px] uppercase">截止日期</span>
                               <span>{task.estimatedTime}</span>
                            </div>
                            <div className="flex flex-col text-right">
                               <span className="opacity-60 text-[10px] uppercase">完成日期</span>
                               <span>{task.completedAt ? new Date(task.completedAt).toLocaleDateString() : '-'}</span>
                            </div>
                         </div>
                         <div className="flex items-center gap-2 mt-1 pt-2 border-t border-slate-100 dark:border-slate-800/50">
                            <ZapIcon className="w-3 h-3 text-amber-500" />
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">耗时: {daysTaken} 天</span>
                         </div>
                      </div>
                   );
                })
             )}
          </div>
        </div>
      </div>
    );
  };

  const renderStats = () => (
    <div className="max-w-6xl mx-auto min-h-0">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">数据分析中心</h1>
          <p className="text-slate-500 dark:text-slate-400 font-mono text-sm">Productivity Analytics</p>
        </div>
        <Button variant="secondary" onClick={() => navigateTo('dashboard')}>
          <ChevronLeft className="w-4 h-4 mr-1" /> 返回看板
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 mb-8">
        {/* Quadrant Stats */}
        <div className="lg:col-span-1">
           <Card title="象限分布概览" className="h-full border-t-4 border-t-blue-500">
             <div className="space-y-6">
               {[QuadrantType.DO, QuadrantType.PLAN, QuadrantType.DELEGATE, QuadrantType.ELIMINATE].map(type => {
                 const count = state.tasks.filter(t => t.quadrant === type && !t.isCompleted).length;
                 const total = state.tasks.filter(t => !t.isCompleted).length || 1;
                 const percentage = Math.round((count / total) * 100);
                 
                 const colors = {
                   [QuadrantType.DO]: 'bg-blue-500',
                   [QuadrantType.PLAN]: 'bg-emerald-500',
                   [QuadrantType.DELEGATE]: 'bg-amber-500',
                   [QuadrantType.ELIMINATE]: 'bg-rose-500'
                 };

                 const labels = {
                   [QuadrantType.DO]: '马上做 (Do)',
                   [QuadrantType.PLAN]: '计划做 (Plan)',
                   [QuadrantType.DELEGATE]: '授权做 (Delegate)',
                   [QuadrantType.ELIMINATE]: '减少做 (Eliminate)'
                 };

                 return (
                   <div key={type} className="group">
                     <div className="flex justify-between text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                       <span>{labels[type]}</span>
                       <span>{count}</span>
                     </div>
                     <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                       <div 
                         className={`h-full ${colors[type]} transition-all duration-1000 ease-out`} 
                         style={{ width: `${percentage}%` }}
                       ></div>
                     </div>
                   </div>
                 );
               })}
             </div>
           </Card>
        </div>

        {/* Heatmap Stats */}
        <div className="lg:col-span-2">
          <Card title="每日任务热力图" className="h-full border-t-4 border-t-emerald-500">
             <div className="flex flex-col h-full">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">点击方块查看详情。颜色代表任务密度。</p>
                <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 md:p-6 border border-slate-100 dark:border-slate-800/50 overflow-hidden">
                   <Heatmap tasks={state.tasks} onDayClick={(date, tasks) => setSelectedDateTasks({ date, tasks })} />
                </div>
             </div>
          </Card>
        </div>
      </div>
    </div>
  );
  
  const renderWizard = () => (
    <div className="max-w-2xl mx-auto w-full min-h-0 flex flex-col justify-center">
      <Button variant="outline" onClick={() => navigateTo('dashboard')} className="self-start mb-6 md:mb-8 hover:bg-white dark:hover:bg-slate-800 border-none shadow-sm">
        <ChevronLeft className="w-4 h-4 mr-1" /> 返回看板
      </Button>
      
      <Card className="shadow-2xl dark:shadow-blue-900/10 border-0 bg-white/80 dark:bg-[#1e293b]/90 backdrop-blur-xl">
        {state.wizardStep === 'input' && (
          <div className="space-y-6 md:space-y-8 py-4">
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">新任务</h2>
              <p className="text-slate-500 dark:text-slate-400">让我们开始分析您的待办事项</p>
            </div>
            
            <div className="space-y-6">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                <input
                  type="text"
                  placeholder="例如：完成季度财务报表"
                  className="relative block w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-lg p-4 md:p-5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-slate-400 shadow-xl shadow-slate-200/50 dark:shadow-none"
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTaskInputSubmit()}
                  autoFocus
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">截止日期</label>
                  <input 
                    type="date"
                    className="w-full bg-transparent font-mono text-slate-700 dark:text-slate-300 focus:outline-none text-sm"
                    value={inputTime}
                    onChange={(e) => setInputTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {state.error && (
              <div className="p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-sm rounded-xl flex items-center gap-3 animate-shake">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {state.error}
              </div>
            )}

            <Button onClick={handleTaskInputSubmit} isLoading={isLoading} className="w-full py-4 text-lg rounded-xl shadow-blue-500/25">
              开始评估 <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        )}

        {state.wizardStep === 'assessment' && (
          <div className="space-y-6 md:space-y-8 py-2">
             <div className="text-center">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">情境评估</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">请快速回答以下 3 个关键问题</p>
             </div>
             
             <div className="space-y-4">
               {state.currentQuestions.map((q, idx) => (
                 <div key={q.id} className="p-5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700/50 transition-all duration-300 hover:border-blue-200 dark:hover:border-blue-800">
                   <p className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-4 leading-relaxed">{q.text}</p>
                   <div className="flex gap-3">
                     <button
                       onClick={() => setState(prev => ({ ...prev, currentAnswers: { ...prev.currentAnswers, [idx]: true } }))}
                       className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all duration-200 border-2 ${state.currentAnswers[idx] === true ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600'}`}
                     >
                       Yes
                     </button>
                     <button
                       onClick={() => setState(prev => ({ ...prev, currentAnswers: { ...prev.currentAnswers, [idx]: false } }))}
                       className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all duration-200 border-2 ${state.currentAnswers[idx] === false ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600'}`}
                     >
                       No
                     </button>
                   </div>
                 </div>
               ))}
             </div>

             <div className="pt-4">
               <Button 
                  onClick={handleAnswerSubmit} 
                  disabled={Object.keys(state.currentAnswers).length < state.currentQuestions.length}
                  className="w-full py-4 text-lg rounded-xl"
               >
                 生成分析报告 <BrainCircuit className="w-5 h-5 ml-2" />
               </Button>
             </div>
          </div>
        )}

        {(state.wizardStep === 'analyzing' || state.batchWizardStep === 'analyzing') && (
          <div className="py-12 md:py-16 text-center space-y-6 md:space-y-8">
            <div className="relative w-20 h-20 md:w-24 md:h-24 mx-auto">
               <div className="absolute inset-0 border-4 border-slate-100 dark:border-slate-800 rounded-full"></div>
               <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
               <BrainCircuit className="absolute inset-0 m-auto w-8 h-8 md:w-10 md:h-10 text-blue-500 animate-pulse" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white mb-2">AI 正在思考中</h3>
              <p className="text-slate-500 dark:text-slate-400 min-h-[24px] transition-all duration-500">
                 {state.view === 'batch-wizard' ? BATCH_THINKING_MESSAGES[thinkingStep] : THINKING_MESSAGES[thinkingStep]}
              </p>
            </div>
          </div>
        )}

        {state.wizardStep === 'result' && state.currentAnalysis && (
          <div className="space-y-6 md:space-y-8">
             <div className="text-center pb-4 border-b border-slate-100 dark:border-slate-800">
                <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">分析结果</span>
                <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white mt-1">{state.currentTaskInput?.name}</h2>
             </div>
             
             <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl text-center border border-slate-100 dark:border-slate-700">
                   <p className="text-xs text-slate-400 font-bold uppercase mb-1">紧急性</p>
                   <p className={`text-lg font-bold ${state.currentAnalysis.isUrgent ? 'text-rose-500' : 'text-slate-600 dark:text-slate-400'}`}>
                      {state.currentAnalysis.isUrgent ? 'Urgent' : 'Not Urgent'}
                   </p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl text-center border border-slate-100 dark:border-slate-700">
                   <p className="text-xs text-slate-400 font-bold uppercase mb-1">重要性</p>
                   <p className={`text-lg font-bold ${state.currentAnalysis.isImportant ? 'text-blue-500' : 'text-slate-600 dark:text-slate-400'}`}>
                      {state.currentAnalysis.isImportant ? 'Important' : 'Not Important'}
                   </p>
                </div>
             </div>

             <div className={`p-6 rounded-2xl border-2 flex flex-col items-center justify-center gap-2
                ${state.currentAnalysis.quadrant === QuadrantType.DO ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300' : ''}
                ${state.currentAnalysis.quadrant === QuadrantType.PLAN ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : ''}
                ${state.currentAnalysis.quadrant === QuadrantType.DELEGATE ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300' : ''}
                ${state.currentAnalysis.quadrant === QuadrantType.ELIMINATE ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300' : ''}
             `}>
                <span className="text-sm font-bold uppercase opacity-70">建议归类</span>
                <span className="text-3xl font-black">{state.currentAnalysis.quadrant}</span>
             </div>

             <div className="space-y-4">
                <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                   <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" /> 核心逻辑
                   </h4>
                   <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                      {getLocalizedContent(state.currentAnalysis.reasoning)}
                   </p>
                </div>
                <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                   <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-500" /> 策略建议
                   </h4>
                   <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                      {getLocalizedContent(state.currentAnalysis.advice)}
                   </p>
                </div>
             </div>

             <div className="flex gap-3 pt-4">
                <Button variant="secondary" onClick={() => setState(prev => ({...prev, wizardStep: 'assessment'}))} className="flex-1">
                   重新评估
                </Button>
                <Button onClick={handleSaveTask} className="flex-[2] shadow-lg shadow-blue-500/20" isLoading={isLoading}>
                   确认并添加 <CheckCircle className="w-5 h-5 ml-2" />
                </Button>
             </div>
          </div>
        )}
      </Card>
    </div>
  );

  const renderBatchWizard = () => (
     <div className="max-w-4xl mx-auto w-full min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-6 md:mb-8">
           <Button variant="outline" onClick={() => navigateTo('dashboard')} className="border-none shadow-sm hover:bg-white dark:hover:bg-slate-800">
             <ChevronLeft className="w-4 h-4 mr-1" /> 返回看板
           </Button>
           <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">批量任务创建</h2>
        </div>

        <Card className="shadow-2xl dark:shadow-indigo-900/10 border-0 bg-white/80 dark:bg-[#1e293b]/90 backdrop-blur-xl flex-1 flex flex-col min-h-0">
           {state.batchWizardStep === 'input' && (
              <div className="space-y-6 h-full flex flex-col">
                 <div className="flex-none">
                    <p className="text-slate-500 dark:text-slate-400">输入多个任务，每行一个。AI 将协助您快速分类。</p>
                 </div>
                 <div className="flex-1 flex flex-col min-h-[300px]">
                    <TextArea 
                       label="任务列表" 
                       placeholder={`例如：\n整理年度财务报表\n预订下周出差机票\n回复客户咨询邮件`}
                       value={batchRawInput}
                       onChange={e => setBatchRawInput(e.target.value)}
                       className="flex-1 font-mono text-sm leading-relaxed"
                    />
                 </div>
                 <div className="flex-none bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mb-4">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">统一截止日期 (可选)</label>
                    <input type="date" value={batchCommonDate} onChange={e => setBatchCommonDate(e.target.value)} className="w-full bg-transparent text-slate-700 dark:text-slate-300 font-mono text-sm focus:outline-none" />
                 </div>
                 <div className="flex-none">
                    <Button onClick={handleBatchInputSubmit} isLoading={isLoading} className="w-full py-4 text-lg rounded-xl shadow-indigo-500/25 bg-indigo-600 hover:bg-indigo-700">
                       下一步：批量评估 <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                 </div>
                 {state.error && <div className="text-rose-500 text-sm text-center font-medium animate-pulse">{state.error}</div>}
              </div>
           )}

           {state.batchWizardStep === 'assessment' && (
              <div className="flex flex-col h-full space-y-6">
                 <div className="flex justify-between items-end pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div>
                       <h3 className="text-xl font-bold text-slate-900 dark:text-white">批量评估</h3>
                       <p className="text-sm text-slate-500 dark:text-slate-400">请快速回答以下关键问题</p>
                    </div>
                    <div className="text-sm font-mono font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1 rounded-full">
                       {/* Count strictly fully answered tasks (those with 3 answers) */}
                       {state.batchInputs.filter(t => {
                          const ans = state.batchAnswers[t.id];
                          return ans && ans[0] !== undefined && ans[1] !== undefined && ans[2] !== undefined;
                       }).length}/{state.batchInputs.length} 已填完
                    </div>
                 </div>

                 <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
                    {state.batchInputs.map((task) => {
                       const questions = state.batchQuestions[task.id] || [];
                       return (
                          <div key={task.id} className="p-5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                             <h4 className="font-bold text-lg text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                {task.name}
                             </h4>
                             <div className="grid grid-cols-1 gap-4">
                                {questions.map((qText, qIdx) => (
                                   <div key={qIdx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700/50">
                                      <span className="text-sm text-slate-600 dark:text-slate-300 font-medium flex-1">{qText}</span>
                                      <div className="flex gap-2 shrink-0">
                                         <button 
                                            onClick={() => setState(prev => ({...prev, batchAnswers: {...prev.batchAnswers, [task.id]: {...prev.batchAnswers[task.id], [qIdx]: true}}}))}
                                            className={`px-4 py-1.5 rounded text-xs font-bold border transition-colors ${state.batchAnswers[task.id]?.[qIdx] === true ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-50 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-600 hover:border-emerald-400'}`}
                                         >Yes</button>
                                         <button 
                                            onClick={() => setState(prev => ({...prev, batchAnswers: {...prev.batchAnswers, [task.id]: {...prev.batchAnswers[task.id], [qIdx]: false}}}))}
                                            className={`px-4 py-1.5 rounded text-xs font-bold border transition-colors ${state.batchAnswers[task.id]?.[qIdx] === false ? 'bg-rose-500 text-white border-rose-500' : 'bg-slate-50 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-600 hover:border-rose-400'}`}
                                         >No</button>
                                      </div>
                                   </div>
                                ))}
                             </div>
                          </div>
                       );
                    })}
                 </div>

                 <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <Button onClick={handleBatchAnswerSubmit} className="w-full py-4 text-lg rounded-xl shadow-indigo-500/25 bg-indigo-600 hover:bg-indigo-700">
                       生成批量分析 <BrainCircuit className="w-5 h-5 ml-2" />
                    </Button>
                 </div>
                 {state.error && <div className="text-rose-500 text-sm text-center font-medium animate-pulse">{state.error}</div>}
              </div>
           )}

           {state.batchWizardStep === 'review' && (
              <div className="flex flex-col h-full space-y-6">
                 <div className="flex-none pb-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">批量分析结果</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">请确认分类，必要时可手动调整，然后保存。</p>
                 </div>

                 <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                    {state.batchResults.map((res, idx) => {
                       const original = state.batchInputs.find(t => t.id === res.taskId);
                       return (
                          <div key={idx} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-4 items-start">
                             <div className="flex-1">
                                <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-1">{original?.name}</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">{getLocalizedContent(res.reasoning)}</p>
                                <div className="flex items-center gap-2 text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 px-2 py-1 rounded w-fit">
                                   <Sparkles className="w-3 h-3" />
                                   {getLocalizedContent(res.advice)}
                                </div>
                             </div>
                             <div className="flex flex-row md:flex-col gap-2 shrink-0 w-full md:w-auto overflow-x-auto md:overflow-visible">
                                {[QuadrantType.DO, QuadrantType.PLAN, QuadrantType.DELEGATE, QuadrantType.ELIMINATE].map(q => (
                                   <button
                                      key={q}
                                      onClick={() => {
                                         const newResults = [...state.batchResults];
                                         newResults[idx].quadrant = q;
                                         setState(prev => ({ ...prev, batchResults: newResults }));
                                      }}
                                      className={`px-3 py-1.5 rounded text-xs font-bold border whitespace-nowrap transition-all ${res.quadrant === q ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900 border-transparent' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-400'}`}
                                   >
                                      {q}
                                   </button>
                                ))}
                             </div>
                          </div>
                       );
                    })}
                 </div>

                 <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <Button onClick={handleBatchReviewSave} isLoading={isLoading} className="w-full py-4 text-lg rounded-xl shadow-emerald-500/25 bg-emerald-600 hover:bg-emerald-700">
                       确认并批量添加 <CheckCircle className="w-5 h-5 ml-2" />
                    </Button>
                 </div>
              </div>
           )}
        </Card>
     </div>
  );

  const renderSettings = () => (
    <div className="max-w-3xl mx-auto w-full min-h-0 flex flex-col">
       <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white">系统设置</h2>
            <p className="text-slate-500 dark:text-slate-400 font-mono text-sm">System Configuration</p>
          </div>
          <Button variant="outline" onClick={() => navigateTo('dashboard')} className="border-none shadow-sm hover:bg-white dark:hover:bg-slate-800">
            <X className="w-5 h-5 mr-1" /> 关闭
          </Button>
       </div>

       <div className="flex-1 overflow-y-auto custom-scrollbar pb-10 space-y-8">
          {/* AI Settings */}
          <section className="space-y-4">
             <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                <Cpu className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">AI 模型配置</h3>
             </div>
             
             <Card className="p-0 overflow-hidden border-blue-100 dark:border-blue-900/30">
                <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-900/30 flex gap-4">
                   <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                         type="radio" 
                         name="aiProvider"
                         value="gemini"
                         checked={tempSettings.aiProvider === 'gemini'}
                         onChange={() => setTempSettings(s => ({ ...s, aiProvider: 'gemini' }))}
                         className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-bold text-slate-700 dark:text-slate-300">Google Gemini</span>
                   </label>
                   <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                         type="radio" 
                         name="aiProvider"
                         value="siliconflow"
                         checked={tempSettings.aiProvider === 'siliconflow'}
                         onChange={() => setTempSettings(s => ({ ...s, aiProvider: 'siliconflow' }))}
                         className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-bold text-slate-700 dark:text-slate-300">SiliconFlow (DeepSeek)</span>
                   </label>
                </div>

                <div className="p-5 space-y-5">
                   {tempSettings.aiProvider === 'gemini' ? (
                      <>
                         <InputField 
                            label="Gemini API Key" 
                            type="password" 
                            value={tempSettings.geminiApiKey} 
                            onChange={e => setTempSettings(s => ({ ...s, geminiApiKey: e.target.value }))}
                            placeholder="AIzaSy..."
                         />
                         <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-400 mb-2">模型版本</label>
                            <div className="flex gap-3">
                               <button 
                                  onClick={() => setTempSettings(s => ({ ...s, aiModel: 'flash' }))}
                                  className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-bold transition-all ${tempSettings.aiModel === 'flash' ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}
                               >
                                  Gemini 2.5 Flash (快速)
                               </button>
                               <button 
                                  onClick={() => setTempSettings(s => ({ ...s, aiModel: 'pro' }))}
                                  className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-bold transition-all ${tempSettings.aiModel === 'pro' ? 'border-purple-500 bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}
                               >
                                  Gemini 3 Pro (高智商)
                               </button>
                            </div>
                         </div>
                      </>
                   ) : (
                      <>
                         <InputField 
                            label="SiliconFlow API Key" 
                            type="password" 
                            value={tempSettings.siliconFlowApiKey} 
                            onChange={e => setTempSettings(s => ({ ...s, siliconFlowApiKey: e.target.value }))}
                            placeholder="sk-..."
                         />
                         <InputField 
                            label="Model Name" 
                            value={tempSettings.siliconFlowModel} 
                            onChange={e => setTempSettings(s => ({ ...s, siliconFlowModel: e.target.value }))}
                            placeholder="deepseek-ai/DeepSeek-V3"
                            helperText="例如: deepseek-ai/DeepSeek-V3, deepseek-ai/DeepSeek-R1"
                         />
                      </>
                   )}

                   <div className="flex items-center gap-4 pt-2">
                      <Button variant="secondary" onClick={testAI} isLoading={aiConnectionStatus === 'testing'} className="w-full md:w-auto">
                         {aiConnectionStatus === 'success' ? <span className="text-emerald-600 flex items-center"><CheckCircle className="w-4 h-4 mr-2"/> 连接成功</span> : '测试 AI 连接'}
                      </Button>
                      {aiConnectionStatus === 'failed' && <span className="text-rose-500 text-sm font-medium">连接失败，请检查 Key</span>}
                   </div>
                </div>
             </Card>
          </section>

          {/* User Context */}
          <section className="space-y-4">
             <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                <UserCog className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">个性化上下文</h3>
             </div>
             <Card>
                <TextArea 
                   label="您的职业角色 / 背景" 
                   value={tempSettings.userContext} 
                   onChange={e => setTempSettings(s => ({ ...s, userContext: e.target.value }))}
                   placeholder="例如：我是一名产品经理，负责两个SaaS产品，平时会议很多..."
                   helperText="AI 将根据您的角色调整评估标准（例如：对CEO来说，'授权'更重要）"
                   className="min-h-[100px]"
                />
                <TextArea 
                   label="自定义 Prompt 指令 (可选)" 
                   value={tempSettings.customPrompt} 
                   onChange={e => setTempSettings(s => ({ ...s, customPrompt: e.target.value }))}
                   placeholder="例如：请用更严厉的语气指出我的拖延问题..."
                   className="min-h-[80px]"
                />
             </Card>
          </section>
          
          <div className="h-12"></div>
       </div>

       <div className="flex-none pt-6 border-t border-slate-200 dark:border-slate-700 flex gap-4 bg-slate-50 dark:bg-[#0f172a] -mx-4 px-4 sticky bottom-0">
          <Button variant="secondary" onClick={resetSettings} className="flex-1">重置默认</Button>
          <Button onClick={saveSettings} className="flex-[2] shadow-lg shadow-blue-500/20">保存设置</Button>
       </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300 bg-slate-50 dark:bg-[#0f172a] text-slate-900 dark:text-slate-200 overflow-hidden font-sans">
      {/* Top Navigation Bar */}
      <header className="flex-none h-16 bg-white/80 dark:bg-[#1e293b]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-50 sticky top-0">
        <div className="max-w-[1920px] mx-auto px-4 md:px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigateTo('dashboard')}>
            <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Cpu className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <span className="font-black text-lg md:text-xl tracking-tighter hidden md:block">Matrix<span className="text-slate-400 font-normal">AI</span></span>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={toggleLanguage}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors relative group"
              title={state.language === 'zh' ? "Switch to English" : "切换为中文"}
            >
               <Languages className="w-5 h-5" />
               <span className="absolute top-1 right-1 flex h-2 w-2">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500 font-bold text-[8px] items-center justify-center text-white">{state.language.toUpperCase()}</span>
               </span>
            </button>
            <button 
              onClick={toggleTheme} 
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
            >
              {state.theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button 
              onClick={() => navigateTo('settings')} 
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        <div className="absolute inset-0 overflow-y-auto custom-scrollbar">
          <div className="max-w-[1920px] mx-auto p-4 md:p-6 lg:p-8 min-h-full">
            {state.view === 'dashboard' && renderDashboard()}
            {state.view === 'wizard' && renderWizard()}
            {state.view === 'batch-wizard' && renderBatchWizard()}
            {state.view === 'settings' && renderSettings()}
            {state.view === 'stats' && renderStats()}
            {state.view === 'completed-tasks' && renderCompletedTasks()}
          </div>
        </div>
      </main>

      {/* Task Detail Overlay (Mobile) */}
      {selectedTask && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           {renderTaskDetail(selectedTask, true)}
        </div>
      )}
    </div>
  );
};

export default App;