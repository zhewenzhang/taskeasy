
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisResult, QuadrantType, TaskInput, UserSettings, AIProvider, BatchTaskInput, BatchAnalysisResult, BilingualText } from "../types";

// --- Gemini Constants ---
const GEMINI_MODEL_FLASH = 'gemini-2.5-flash';
const GEMINI_MODEL_PRO = 'gemini-3-pro-preview';

// --- SiliconFlow Constants ---
const SILICONFLOW_API_URL = "https://api.siliconflow.cn/v1/chat/completions";

// --- Helper: Retry Logic ---
async function retry<T>(
  fn: () => Promise<T>, 
  retries = 3, 
  baseDelay = 1000
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const status = error?.status || error?.response?.status || error?.code;
      
      // Don't retry 4xx errors unless it's 429
      if (status && status >= 400 && status < 500 && status !== 429) {
        break;
      }

      if (i < retries - 1) {
        console.warn(`API Attempt ${i + 1} failed, retrying...`, error);
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // Error Handling & Translation
  if (lastError) {
    const msg = lastError.message || JSON.stringify(lastError);
    const status = lastError.status || lastError.response?.status || lastError.code;

    if (status === 429 || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      throw new Error("API 调用频率受限 (429)。配额已用尽或请求过快，请稍后重试。");
    }
    if (status === 401 || status === 403 || msg.includes('PERMISSION_DENIED')) {
       throw new Error("API Key 无效或无权限 (401/403)。请检查设置中的 Key 是否正确。");
    }
    if (status >= 500) {
      throw new Error("AI 服务端暂时不可用 (5xx)。请稍后重试。");
    }
    throw lastError;
  }
  throw new Error("Unknown error occurred during API call.");
}

// --- SiliconFlow Implementation (OpenAI Compatible) ---
async function callSiliconFlow(
  messages: { role: string; content: string }[],
  settings: UserSettings,
  jsonMode: boolean = true
): Promise<string> {
  const apiKey = settings.siliconFlowApiKey;
  const model = settings.siliconFlowModel || "deepseek-ai/DeepSeek-V3";
  
  if (!apiKey) throw new Error("请在设置中填写 SiliconFlow API Key");

  const response = await fetch(SILICONFLOW_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: settings.creativity ?? 0.7,
      response_format: jsonMode ? { type: "json_object" } : undefined,
      stream: false
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw { status: response.status, message: errData.message || response.statusText };
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// --- Gemini Implementation ---
const getGeminiClient = (apiKey?: string) => {
  const keyToUse = apiKey || process.env.API_KEY;
  if (!keyToUse) throw new Error("未检测到 Gemini API Key。");
  return new GoogleGenAI({ apiKey: keyToUse });
};

// --- Unified Connection Test ---
export const testAIConnection = async (settings: UserSettings): Promise<boolean> => {
  try {
    if (settings.aiProvider === 'siliconflow') {
      await callSiliconFlow(
        [{ role: "user", content: "Hello, just say hi." }], 
        settings, 
        false // No JSON needed for ping
      );
    } else {
      const ai = getGeminiClient(settings.geminiApiKey);
      await ai.models.generateContent({
        model: GEMINI_MODEL_FLASH,
        contents: "Hello",
      });
    }
    return true;
  } catch (error) {
    console.error("Connection Test Failed:", error);
    return false;
  }
};

// --- Single Task Logic ---

export const generateAssessmentQuestions = async (task: TaskInput, settings: UserSettings): Promise<string[]> => {
  const temperature = settings.creativity ?? 0.7;
  const userContextStr = settings.userContext ? `用户背景角色: "${settings.userContext}"` : "";

  const basePrompt = `
    任务名称: "${task.name}"
    截止日期: "${task.estimatedTime}"
    ${userContextStr}
    
    我需要快速判断这个任务是否属于“重要”和“紧急”。
    请生成 3 个**极简短**的中文 是/否 (Yes/No) 问题。
    要求：
    1. 每个问题不超过 15 个汉字。
    2. 简单直接。
    3. Q1 测紧急性 (如果不做会怎样)。
    4. Q2 测重要性 (核心目标)。
    5. Q3 测后果。
  `;

  try {
    if (settings.aiProvider === 'siliconflow') {
      const systemPrompt = `你是一个任务管理专家。请输出严格的 JSON 格式。
      格式示例: { "questions": ["问题1?", "问题2?", "问题3?"] }`;
      
      const result = await retry(() => callSiliconFlow(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: basePrompt }
        ],
        settings
      ));
      
      const cleanJson = result.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(cleanJson);
      return data.questions || ["必须今天做吗？", "影响核心目标吗？", "后果严重吗？"];

    } else {
      const ai = getGeminiClient(settings.geminiApiKey);
      const model = settings.aiModel === 'pro' ? GEMINI_MODEL_PRO : GEMINI_MODEL_FLASH;
      
      const response = await retry<GenerateContentResponse>(() => ai.models.generateContent({
        model: model,
        contents: basePrompt,
        config: {
          temperature: temperature,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["questions"]
          }
        }
      }));

      const data = JSON.parse(response.text || "{}");
      return data.questions || [];
    }
  } catch (error) {
    console.error("Error generating questions:", error);
    throw error;
  }
};

export const analyzeTaskWithGemini = async (
  task: TaskInput,
  questions: string[],
  answers: Record<string, boolean>,
  settings: UserSettings
): Promise<AnalysisResult> => {
  
  const qaPairs = questions.map((q, index) => `问: ${q} 答: ${answers[index] ? '是' : '否'}`).join('\n');
  const userContextStr = settings.userContext ? `当前用户职业/角色: ${settings.userContext}` : "";
  const customInstruction = settings.customPrompt ? `用户特别偏好: ${settings.customPrompt}` : "";

  const basePrompt = `
    # Role
    你是一位拥有20年经验的高级战略顾问和效率专家。请基于艾森豪威尔矩阵，对用户任务进行深度剖析。

    # Inputs
    任务: "${task.name}"
    截止日期: "${task.estimatedTime}"
    用户评估回答:
    ${qaPairs}
    
    ${userContextStr}
    ${customInstruction}

    # Goals
    1. **精准分类**: 判断任务象限。
    2. **深度策略 (Advice - 核心部分)**: 
       - 请不要只给空泛的建议。用户需要知道**具体该怎么做**。
       - 必须提供一个具体的**思维模型**或**方法论**。
       - 指出执行过程中可能的**陷阱**或**风险**。
    3. **行动拆解**: 3-5 个可立即执行的原子步骤。

    # Output Rules
    - **双语输出**: 所有的分析字段 (reasoning, steps, advice) 都必须包含中文 (cn) 和英文 (en) 两个版本。
    - 输出格式: JSON
  `;

  try {
    if (settings.aiProvider === 'siliconflow') {
      const systemPrompt = `你是一个高级战略顾问。请仅输出 JSON 格式。
      JSON 结构: 
      { 
        "isImportant": boolean, 
        "isUrgent": boolean, 
        "quadrantName": "Do" | "Plan" | "Delegate" | "Eliminate", 
        "reasoning": { "cn": "...", "en": "..." }, 
        "steps": [{ "cn": "...", "en": "..." }], 
        "advice": { "cn": "...", "en": "..." } 
      }`;

      const result = await retry(() => callSiliconFlow(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: basePrompt }
        ],
        settings
      ));

      const cleanJson = result.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(cleanJson);

      return {
        quadrant: data.quadrantName as QuadrantType,
        isImportant: data.isImportant,
        isUrgent: data.isUrgent,
        reasoning: data.reasoning,
        steps: data.steps || [],
        advice: data.advice
      };

    } else {
      const ai = getGeminiClient(settings.geminiApiKey);
      const model = settings.aiModel === 'pro' ? GEMINI_MODEL_PRO : GEMINI_MODEL_FLASH;

      const response = await retry<GenerateContentResponse>(() => ai.models.generateContent({
        model: model,
        contents: basePrompt,
        config: {
          temperature: settings.creativity ?? 0.7,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isImportant: { type: Type.BOOLEAN },
              isUrgent: { type: Type.BOOLEAN },
              quadrantName: { type: Type.STRING, enum: [QuadrantType.DO, QuadrantType.PLAN, QuadrantType.DELEGATE, QuadrantType.ELIMINATE] },
              reasoning: { 
                type: Type.OBJECT,
                properties: {
                  cn: { type: Type.STRING },
                  en: { type: Type.STRING }
                },
                required: ["cn", "en"]
              },
              steps: { 
                type: Type.ARRAY, 
                items: { 
                  type: Type.OBJECT,
                  properties: {
                    cn: { type: Type.STRING },
                    en: { type: Type.STRING }
                  },
                  required: ["cn", "en"]
                } 
              },
              advice: { 
                type: Type.OBJECT,
                properties: {
                  cn: { type: Type.STRING },
                  en: { type: Type.STRING }
                },
                required: ["cn", "en"]
              }
            },
            required: ["isImportant", "isUrgent", "quadrantName", "reasoning", "steps", "advice"]
          }
        }
      }));

      const data = JSON.parse(response.text || "{}");
      return {
        quadrant: data.quadrantName as QuadrantType,
        isImportant: data.isImportant,
        isUrgent: data.isUrgent,
        reasoning: data.reasoning,
        steps: data.steps || [],
        advice: data.advice
      };
    }
  } catch (error) {
    console.error("Error analyzing task:", error);
    throw error;
  }
};


// --- Batch Task Logic ---

export const generateBatchAssessmentQuestions = async (
  tasks: BatchTaskInput[], 
  settings: UserSettings
): Promise<Record<string, string[]>> => {
  // Limit processing for huge batches
  const BATCH_LIMIT = 20; 
  if (tasks.length > BATCH_LIMIT) throw new Error(`一次最多处理 ${BATCH_LIMIT} 个任务`);

  const taskListString = tasks.map((t, i) => `${i+1}. [ID:${t.id}] ${t.name} (截止:${t.estimatedTime})`).join('\n');
  const userContextStr = settings.userContext ? `User Context: "${settings.userContext}"` : "";

  // Modified prompt to request 3 guided scenario-based questions
  const basePrompt = `
    Tasks List:
    ${taskListString}
    ${userContextStr}

    Goal: Generate exactly 3 guided YES/NO questions for EACH task to determine its Eisenhower Matrix quadrant.
    
    Constraint: 
    - Do NOT use abstract words like "Urgent" (紧急) or "Important" (重要).
    - Use scenario-based questions.
    
    Question Logic:
    1. Q1 (Time Sensitivity): Ask about the consequences of delay or strict deadlines (e.g., "Must this be finished today to avoid penalties?", "Is there a hard deadline today?").
    2. Q2 (Value/Impact): Ask about the relation to core goals or high value (e.g., "Does this directly impact the OKR?", "Is this key to the project's success?").
    3. Q3 (Delegation/Necessity): Ask if it can be done by others or skipped (e.g., "Can this be delegated to a junior?", "Is this strictly required for me to do personally?").

    Format: JSON Object where keys are Task IDs and values are arrays of 3 strings (questions).
    Language: Chinese (Short, concise, under 15 chars).
  `;

  try {
     const systemPrompt = `Return JSON only. Example: { "temp-1": ["今天必须完成吗？", "影响核心KPI吗？", "非我不行吗？"], "temp-2": [...] }`;
     
     if (settings.aiProvider === 'siliconflow') {
       const result = await retry(() => callSiliconFlow(
         [{ role: "system", content: systemPrompt }, { role: "user", content: basePrompt }],
         settings
       ));
       return JSON.parse(result.replace(/```json/g, '').replace(/```/g, '').trim());
     } else {
       const ai = getGeminiClient(settings.geminiApiKey);
       const response = await retry<GenerateContentResponse>(() => ai.models.generateContent({
         model: GEMINI_MODEL_FLASH, // Use Flash for batch speed
         contents: basePrompt,
         config: {
           responseMimeType: "application/json",
         }
       }));
       return JSON.parse(response.text || "{}");
     }
  } catch (error) {
    console.error("Batch Questions Error:", error);
    throw error;
  }
};

export const analyzeBatchTasks = async (
  tasks: BatchTaskInput[],
  questionsMap: Record<string, string[]>,
  answersMap: Record<string, Record<number, boolean>>,
  settings: UserSettings
): Promise<BatchAnalysisResult[]> => {
  
  const inputs = tasks.map(t => {
    const qs = questionsMap[t.id] || [];
    const as = answersMap[t.id] || {};
    const qa = qs.map((q, i) => `Q${i+1}:${q} A:${as[i] ? 'Yes' : 'No'}`).join(' | ');
    return `ID: ${t.id} | Task: ${t.name} | Due: ${t.estimatedTime} | Assessment: [${qa}]`;
  }).join('\n');

  const basePrompt = `
    Analyze these tasks for Eisenhower Matrix classification.
    Inputs:
    ${inputs}
    
    Context: ${settings.userContext || "None"}

    Logic Guide:
    - Q1 is about Time/Deadline. Yes = Urgent.
    - Q2 is about Value/Impact. Yes = Important.
    - Q3 is about Delegation/Necessity. Use it to decide between Delegate and Eliminate if needed.

    Requirements:
    1. Classify each task into: Do, Plan, Delegate, Eliminate.
    2. Provide 1 sentence of short, punchy advice.
    3. **Bilingual Output**: Provide reasoning and advice in both Chinese (cn) and English (en).
    4. Return JSON Array.
  `;

  try {
    if (settings.aiProvider === 'siliconflow') {
       const systemPrompt = `Return JSON Array: [{ "taskId": "string", "quadrant": "Do|Plan|Delegate|Eliminate", "reasoning": { "cn": "", "en": "" }, "advice": { "cn": "", "en": "" } }]`;

       const result = await retry(() => callSiliconFlow(
         [{ role: "system", content: systemPrompt }, { role: "user", content: basePrompt }],
         settings
       ));
       return JSON.parse(result.replace(/```json/g, '').replace(/```/g, '').trim());
    } else {
       const ai = getGeminiClient(settings.geminiApiKey);
       const response = await retry<GenerateContentResponse>(() => ai.models.generateContent({
         model: GEMINI_MODEL_FLASH,
         contents: basePrompt,
         config: {
           responseMimeType: "application/json",
           responseSchema: {
             type: Type.ARRAY,
             items: {
               type: Type.OBJECT,
               properties: {
                 taskId: { type: Type.STRING },
                 quadrant: { type: Type.STRING, enum: [QuadrantType.DO, QuadrantType.PLAN, QuadrantType.DELEGATE, QuadrantType.ELIMINATE] },
                 reasoning: { 
                   type: Type.OBJECT,
                   properties: { cn: { type: Type.STRING }, en: { type: Type.STRING } },
                   required: ["cn", "en"]
                 },
                 advice: { 
                   type: Type.OBJECT,
                   properties: { cn: { type: Type.STRING }, en: { type: Type.STRING } },
                   required: ["cn", "en"]
                 }
               },
               required: ["taskId", "quadrant", "reasoning", "advice"]
             }
           }
         }
       }));
       return JSON.parse(response.text || "[]");
    }
  } catch (error) {
    console.error("Batch Analysis Error:", error);
    throw error;
  }
};

export const testGeminiConnection = async (apiKey: string) => {
  return testAIConnection({ geminiApiKey: apiKey, aiProvider: 'gemini' } as UserSettings);
};
