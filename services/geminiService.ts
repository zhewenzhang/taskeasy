
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisResult, QuadrantType, TaskInput, UserSettings } from "../types";

const MODEL_NAME = 'gemini-2.5-flash';

/**
 * Initialize GoogleGenAI with the key from settings, or fallback to env.
 */
const getAIClient = (settings: UserSettings) => {
  // Use settings key first, then process.env.API_KEY
  const apiKey = settings.geminiApiKey || process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("API Key is missing. Please configure it in Settings.");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Helper to retry async functions (like API calls) with exponential backoff.
 */
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
      console.warn(`API Attempt ${i + 1} failed:`, error);
      
      const status = error?.status || error?.response?.status;
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw error;
      }

      if (i < retries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Step 1: Generate context-aware questions.
 */
export const generateAssessmentQuestions = async (task: TaskInput, settings: UserSettings): Promise<string[]> => {
  try {
    const ai = getAIClient(settings);
    
    const userContextStr = settings.userContext 
      ? `用户背景角色: "${settings.userContext}". 请根据此角色调整问题视角。` 
      : "";

    const prompt = `
      任务名称: "${task.name}"
      截止日期: "${task.estimatedTime}"
      
      ${userContextStr}
      
      我需要快速判断这个任务是否属于“重要”（高价值/核心目标）和“紧急”（必须立刻做）。
      
      请生成 3 个**极简短、直觉化**的 是/否 (Yes/No) 问题。
      要求：
      1. **每个问题不超过 15 个汉字**。
      2. 必须简单直接，用户读完能立刻下意识判断。
      3. 问题 1 侧重“如果不立刻做，是否会死/完蛋”（紧急性）。
      4. 问题 2 侧重“这是否直接贡献于核心KPI/人生目标”（重要性）。
      5. 问题 3 侧重“后果/影响范围”。
      
      所有问题用简体中文。
    `;

    const response = await retry<GenerateContentResponse>(() => ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3个极简短的是非题，中文，不超过15字"
            }
          },
          required: ["questions"]
        }
      }
    }));

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    
    const data = JSON.parse(text);
    return data.questions || [
      "必须今天处理完吗？",
      "这是你的核心目标吗？",
      "不做会有严重后果吗？"
    ];
  } catch (error) {
    console.error("Error generating questions:", error);
    // Fallback if API fails completely (e.g. invalid key)
    if ((error as Error).message.includes("API Key")) {
      throw error;
    }
    return [
      "必须在截止前完成吗？",
      "这对长期目标重要吗？",
      "不做会有严重后果吗？"
    ];
  }
};

/**
 * Step 2: Analyze answers and determine quadrant + breakdown.
 */
export const analyzeTaskWithGemini = async (
  task: TaskInput,
  questions: string[],
  answers: Record<string, boolean>,
  settings: UserSettings
): Promise<AnalysisResult> => {
  
  const ai = getAIClient(settings);

  const qaPairs = questions.map((q, index) => {
    return `问: ${q} 答: ${answers[index] ? '是' : '否'}`;
  }).join('\n');

  const userContextStr = settings.userContext 
      ? `当前用户职业/角色: ${settings.userContext}。请根据此身份提供专业的建议。` 
      : "";

  const customInstruction = settings.customPrompt
      ? `额外分析指令: ${settings.customPrompt}`
      : "";

  const prompt = `
    任务: "${task.name}"
    截止日期: "${task.estimatedTime}"
    
    用户问答背景:
    ${qaPairs}
    
    ${userContextStr}
    ${customInstruction}

    基于以上信息，将任务分类到艾森豪威尔矩阵 (Eisenhower Matrix) 中。
    
    请提供具体的任务拆解步骤（3-5步）和战略建议。
    所有输出必须使用简体中文。
  `;

  const response = await retry<GenerateContentResponse>(() => ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isImportant: { type: Type.BOOLEAN },
          isUrgent: { type: Type.BOOLEAN },
          quadrantName: { 
            type: Type.STRING, 
            enum: [QuadrantType.DO, QuadrantType.PLAN, QuadrantType.DELEGATE, QuadrantType.ELIMINATE] 
          },
          reasoning: { type: Type.STRING, description: "分类理由 (中文)" },
          steps: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "3-5个可执行步骤 (中文)"
          },
          advice: { type: Type.STRING, description: "战略建议 (中文)" }
        },
        required: ["isImportant", "isUrgent", "quadrantName", "reasoning", "steps", "advice"]
      }
    }
  }));

  const text = response.text;
  if (!text) throw new Error("Empty response from AI");

  const data = JSON.parse(text);

  return {
    quadrant: data.quadrantName as QuadrantType,
    isImportant: data.isImportant,
    isUrgent: data.isUrgent,
    reasoning: data.reasoning,
    steps: data.steps || [],
    advice: data.advice
  };
};
