
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Task, UserSettings } from '../types';

let supabaseInstance: SupabaseClient | null = null;
let currentConfig = { url: '', key: '' };

const getClient = (settings: UserSettings): SupabaseClient | null => {
  // 1. Sanitize inputs: Trim whitespace
  let url = settings.supabaseUrl?.trim();
  const key = settings.supabaseKey?.trim();

  if (!url || !key) return null;

  // 2. Auto-fix URL: Ensure protocol exists to prevent "Invalid URL" constructor errors
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  // Singleton-like: Only recreate if config changes
  if (
    !supabaseInstance || 
    currentConfig.url !== url || 
    currentConfig.key !== key
  ) {
    try {
      // 3. Validation: Check if URL is valid before initializing
      new URL(url); 

      supabaseInstance = createClient(url, key);
      currentConfig = { url, key };
    } catch (e) {
      console.error("Failed to initialize Supabase client:", e);
      return null;
    }
  }
  return supabaseInstance;
};

export const supabaseService = {
  testConnection: async (settings: UserSettings): Promise<boolean> => {
    const client = getClient(settings);
    if (!client) return false;
    try {
      // Try a lightweight query to verify credentials
      const { error } = await client.from('tasks').select('count', { count: 'exact', head: true });
      if (error) throw error;
      return true;
    } catch (e) {
      console.error("Supabase Connection Test Failed:", e);
      return false;
    }
  },

  fetchTasks: async (settings: UserSettings): Promise<Task[]> => {
    const client = getClient(settings);
    if (!client) throw new Error("无效的 Supabase 配置 (URL 格式错误或 Key 为空)");

    const { data, error } = await client
      .from('tasks')
      .select('*')
      .order('createdAt', { ascending: true });

    if (error) throw error;
    return data as Task[];
  },

  addTask: async (task: Task, settings: UserSettings): Promise<void> => {
    const client = getClient(settings);
    if (!client) throw new Error("Supabase 未配置");

    const { error } = await client.from('tasks').insert(task);
    if (error) throw error;
  },

  updateTask: async (taskId: string, updates: Partial<Task>, settings: UserSettings): Promise<void> => {
    const client = getClient(settings);
    if (!client) throw new Error("Supabase 未配置");

    const { error } = await client.from('tasks').update(updates).eq('id', taskId);
    if (error) throw error;
  },

  deleteTask: async (taskId: string, settings: UserSettings): Promise<void> => {
    const client = getClient(settings);
    if (!client) throw new Error("Supabase 未配置");

    const { error } = await client.from('tasks').delete().eq('id', taskId);
    if (error) throw error;
  }
};
