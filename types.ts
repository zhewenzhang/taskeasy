
export enum QuadrantType {
  DO = 'Do', // Important & Urgent (马上做)
  PLAN = 'Plan', // Important & Not Urgent (计划做)
  DELEGATE = 'Delegate', // Not Important & Urgent (授权做)
  ELIMINATE = 'Eliminate' // Not Important & Not Urgent (不做/减少做)
}

export interface TaskInput {
  name: string;
  estimatedTime: string;
}

export interface Question {
  id: string;
  text: string;
}

export interface BilingualText {
  cn: string;
  en: string;
}

export interface AnalysisResult {
  quadrant: QuadrantType;
  isImportant: boolean;
  isUrgent: boolean;
  reasoning: BilingualText | string; // Supports legacy string or new bilingual object
  steps: (BilingualText | string)[]; 
  advice: BilingualText | string;
}

export interface Task extends AnalysisResult {
  id: string;
  name: string;
  estimatedTime: string;
  createdAt: number;
  isCompleted?: boolean;
  completedAt?: number;
}

// --- Batch Types ---
export interface BatchTaskInput {
  id: string; // Temporary ID
  name: string;
  estimatedTime: string;
}

export interface BatchAnalysisResult {
  taskId: string;
  quadrant: QuadrantType;
  reasoning: BilingualText | string;
  advice: BilingualText | string;
}

export type AIProvider = 'gemini' | 'siliconflow';

export interface UserSettings {
  // AI Provider Selection
  aiProvider: AIProvider;

  // Gemini Settings
  geminiApiKey: string; 
  aiModel: 'flash' | 'pro'; 

  // SiliconFlow Settings (New)
  siliconFlowApiKey: string;
  siliconFlowModel: string; // e.g., "deepseek-ai/DeepSeek-V3"

  // Common AI Settings
  creativity: number; // Temperature (0.0 - 1.0)
  customPrompt: string;
  userContext: string; 
  
  // Supabase
  supabaseUrl: string;
  supabaseKey: string;
}

export interface AppState {
  theme: 'light' | 'dark';
  language: 'zh' | 'en'; // New Language State
  view: 'dashboard' | 'wizard' | 'batch-wizard' | 'settings' | 'stats' | 'completed-tasks'; 
  
  // Single Task Wizard State
  wizardStep: 'input' | 'assessment' | 'analyzing' | 'result';
  currentTaskInput: TaskInput | null;
  currentQuestions: Question[];
  currentAnswers: Record<string, boolean>; // Question ID -> Yes/No
  currentAnalysis: AnalysisResult | null;
  
  // Batch Task Wizard State
  batchWizardStep: 'input' | 'assessment' | 'analyzing' | 'review';
  batchInputs: BatchTaskInput[];
  batchQuestions: Record<string, string[]>; // TaskID -> Array of Question Strings
  batchAnswers: Record<string, Record<number, boolean>>; // TaskID -> QuestionIndex -> Yes/No
  batchResults: BatchAnalysisResult[];

  error: string | null;
  tasks: Task[]; // List of saved tasks
  settings: UserSettings;
  isSyncing: boolean; // For DB sync status
}