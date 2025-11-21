
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisResult, QuadrantType, TaskInput, UserSettings } from "../types";

// Model Constants
const MODEL_FLASH = 'gemini-2.5-flash';
const MODEL_PRO = 'gemini-3-pro-preview';

/**
 * Initialize GoogleGenAI with the key from settings, or fallback to env.
 */
const getAIClient = (apiKey?: string) => {
  // Prioritize user-provided key, fallback to env, then fail
  const keyToUse = apiKey || process.env.API_KEY;
  
  if (!keyToUse) {
    throw new Error("未检测到 API Key。请在设置中输入您的 Google Gemini API Key。");
  }
  return new GoogleGenAI({ apiKey: keyToUse });
};

/**
 * Helper to get the correct model string based on user settings
 */
const getModelName = (settings: UserSettings) => {
  return settings.aiModel === 'pro' ? MODEL_PRO : MODEL_FLASH;
};

/**
 * Helper to retry async functions (like API calls) with exponential backoff.
 * Also translates raw API errors into friendly Chinese messages.
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
      
      // Extract status code if available
      const status = error?.status || error?.response?.status || error?.code;
      
      // If it's a 4xx error (client error) that isn't 429 (Too Many Requests), don't retry.
      if (status && status >= 400 && status < 500 && status !== 429) {
        break; // Break loop to handle error processing immediately
      }

      // Log warning for retries
      if (i < retries - 1) {
        console.warn(`API Attempt ${i + 1} failed, retrying...`, error);
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // Error Translation Logic
  if (lastError) {
    const msg = lastError.message || JSON.stringify(lastError);
    const status = lastError.status || lastError.response?.status || lastError.code;

    // Case 1: 429 Resource Exhausted (Quota/Rate Limit)
    if (status === 429 || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      throw new Error("API 调用频率受限 (429)。免费版 API Key 每分钟请求次数有限，或您的配额已用尽。请休息几分钟后再试。");
    }
    
    // Case 2: 403 Permission Denied (Invalid Key or Service Disabled)
    if (status === 403 || msg.includes('PERMISSION_DENIED') || msg.includes('API key not valid')) {
       throw new Error("API Key 无效或无权限 (403)。请检查 Key 是否正确，或是否已在 Google AI Studio 中启用了对应项目。");
    }

    // Case 3: 400 Bad Request
    if (status === 400 || msg.includes('INVALID_ARGUMENT')) {
       throw new Error("请求格式错误 (400)。请检查输入内容是否过长或包含特殊字符。");
    }
    
    // Case 4: 500 Server Error
    if (status >= 500) {
      throw new Error("Google 服务端暂时不可用 (5xx)。请稍后重试。");
    }
    
    // Fallback: throw the original error if we can't match it
    throw lastError;
  }

  throw new Error("Unknown error occurred during API call.");
}

/**
 * Test the Gemini API Connection using a specific key (e.g. from input field)
 */
export const testGeminiConnection = async (apiKey: string): Promise<boolean> => {
  try {
    const ai = getAIClient(apiKey);
    // Use Flash for a quick ping
    await ai.models.generateContent({
      model: MODEL_FLASH,
      contents: "Hello",
    });
    return true;
  } catch (error) {
    console.error("Gemini Connection Test Failed:", error);
    return false;
  }
};

/**
 * Step 1: Generate context-aware questions.
 */
export const generateAssessmentQuestions = async (task: TaskInput, settings: UserSettings): Promise<string[]> => {
  try {
    const ai = getAIClient(settings.geminiApiKey);
    const model = getModelName(settings);
    const temperature = settings.creativity ?? 0.7;
    
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
      model: model,
      contents: prompt,
      config: {
        temperature: temperature,
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
    throw error; // UI will now catch the translated user-friendly error
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
  
  const ai = getAIClient(settings.geminiApiKey);
  const model = getModelName(settings);
  const temperature = settings.creativity ?? 0.7;

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
    model: model,
    contents: prompt,
    config: {
      temperature: temperature,
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
