
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

export interface AnalysisResult {
  quadrant: QuadrantType;
  isImportant: boolean;
  isUrgent: boolean;
  reasoning: string;
  steps: string[];
  advice: string;
}

export interface Task extends AnalysisResult {
  id: string;
  name: string;
  estimatedTime: string;
  createdAt: number;
  isCompleted?: boolean;
  completedAt?: number;
}

export interface UserSettings {
  // Gemini
  geminiApiKey: string;
  customPrompt: string;
  userContext: string; 
  
  // Supabase
  supabaseUrl: string;
  supabaseKey: string;
}

export interface AppState {
  theme: 'light' | 'dark';
  view: 'dashboard' | 'wizard' | 'settings' | 'stats'; 
  wizardStep: 'input' | 'assessment' | 'analyzing' | 'result';
  currentTaskInput: TaskInput | null;
  currentQuestions: Question[];
  currentAnswers: Record<string, boolean>; // Question ID -> Yes/No
  currentAnalysis: AnalysisResult | null;
  error: string | null;
  tasks: Task[]; // List of saved tasks
  settings: UserSettings;
  isSyncing: boolean; // For DB sync status
}
