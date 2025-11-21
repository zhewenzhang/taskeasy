
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisResult, QuadrantType, TaskInput, UserSettings, AIProvider } from "../types";

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

// --- Step 1: Generate Questions ---
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
      // SiliconFlow (DeepSeek/Qwen) Logic
      const systemPrompt = `你是一个任务管理专家。请输出严格的 JSON 格式。
      格式示例: { "questions": ["问题1?", "问题2?", "问题3?"] }`;
      
      const result = await retry(() => callSiliconFlow(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: basePrompt }
        ],
        settings
      ));
      
      // Parse JSON (handle potential markdown code blocks)
      const cleanJson = result.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(cleanJson);
      return data.questions || ["必须今天做吗？", "影响核心目标吗？", "后果严重吗？"];

    } else {
      // Gemini Logic
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

// --- Step 2: Analyze Task ---
export const analyzeTaskWithGemini = async (
  task: TaskInput,
  questions: string[],
  answers: Record<string, boolean>,
  settings: UserSettings
): Promise<AnalysisResult> => {
  
  const qaPairs = questions.map((q, index) => `问: ${q} 答: ${answers[index] ? '是' : '否'}`).join('\n');
  const userContextStr = settings.userContext ? `当前用户角色: ${settings.userContext}` : "";
  const customInstruction = settings.customPrompt ? `额外指令: ${settings.customPrompt}` : "";

  const basePrompt = `
    任务: "${task.name}"
    截止日期: "${task.estimatedTime}"
    用户问答背景:
    ${qaPairs}
    ${userContextStr}
    ${customInstruction}

    请将任务分类到艾森豪威尔矩阵 (Eisenhower Matrix)。
    请提供具体的任务拆解步骤（3-5步）和战略建议。
  `;

  try {
    if (settings.aiProvider === 'siliconflow') {
      // SiliconFlow Logic
      const systemPrompt = `你是一个高效能专家。请仅输出 JSON 格式，不要包含其他废话。
      
      JSON 结构必须严格如下:
      {
        "isImportant": boolean,
        "isUrgent": boolean,
        "quadrantName": "Do" | "Plan" | "Delegate" | "Eliminate",
        "reasoning": "分类理由(中文)",
        "steps": ["步骤1", "步骤2"...],
        "advice": "战略建议(中文)"
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
      // Gemini Logic
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
              reasoning: { type: Type.STRING },
              steps: { type: Type.ARRAY, items: { type: Type.STRING } },
              advice: { type: Type.STRING }
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

// Re-export purely for naming compatibility if needed elsewhere, though functionality is merged.
export const testGeminiConnection = async (apiKey: string) => {
  // Legacy wrapper, better to use testAIConnection
  return testAIConnection({ geminiApiKey: apiKey, aiProvider: 'gemini' } as UserSettings);
};
