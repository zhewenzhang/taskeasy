
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Task, UserSettings } from '../types';

let supabaseInstance: SupabaseClient | null = null;
let currentConfig = { url: '', key: '' };

const getClient = (settings: UserSettings): SupabaseClient | null => {
  if (!settings.supabaseUrl || !settings.supabaseKey) return null;

  // Singleton-like: Only recreate if config changes
  if (
    !supabaseInstance || 
    currentConfig.url !== settings.supabaseUrl || 
    currentConfig.key !== settings.supabaseKey
  ) {
    try {
      supabaseInstance = createClient(settings.supabaseUrl, settings.supabaseKey);
      currentConfig = { url: settings.supabaseUrl, key: settings.supabaseKey };
    } catch (e) {
      console.error("Failed to initialize Supabase client", e);
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
      // Try a lightweight query, e.g., fetch 0 items or just check connection
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
    if (!client) throw new Error("Supabase not configured");

    const { data, error } = await client
      .from('tasks')
      .select('*')
      .order('createdAt', { ascending: true });

    if (error) throw error;
    return data as Task[];
  },

  addTask: async (task: Task, settings: UserSettings): Promise<void> => {
    const client = getClient(settings);
    if (!client) throw new Error("Supabase not configured");

    const { error } = await client.from('tasks').insert(task);
    if (error) throw error;
  },

  deleteTask: async (taskId: string, settings: UserSettings): Promise<void> => {
    const client = getClient(settings);
    if (!client) throw new Error("Supabase not configured");

    const { error } = await client.from('tasks').delete().eq('id', taskId);
    if (error) throw error;
  }
};
