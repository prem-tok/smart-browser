/**
 * LLM Vision Analyzer Service
 * Uses LLM vision models (GPT-4 Vision, Claude, Gemini) to analyze screenshots
 * and suggest next actions - inspired by Comet browser's AI-powered analysis
 */

import log from 'electron-log';
import { ConfigManager } from '../main/utils/config-manager';

export interface LLMVisionAnalysisResult {
  pageState: string; // Description of current page state
  nextAction: {
    action: 'click' | 'type' | 'scroll' | 'wait' | 'navigate' | 'human_interact' | 'none';
    target?: string; // Element description or index
    reason: string; // Why this action is suggested
    confidence: number; // 0-1
  };
  isStuck: boolean; // Whether agent appears to be in a loop
  requiresHumanHelp: boolean; // Whether human intervention is needed
  suggestions: string[]; // List of suggested actions
}

/**
 * Analyze screenshot using LLM vision model
 * Falls back to heuristic analysis if LLM is not available
 */
export async function analyzeScreenshotWithLLM(
  screenshotBase64: string,
  elements: Array<{ index: number; label: string; ariaLabel?: string; tagName?: string }>,
  currentUrl: string,
  taskContext?: string
): Promise<LLMVisionAnalysisResult> {
  try {
    const configManager = ConfigManager.getInstance();
    const selectedProvider = configManager.getSelectedProvider();
    const providerConfig = configManager.getModelConfig(selectedProvider);

    // Check if we have a vision-capable model
    const visionModels = ['gpt-4o', 'gpt-4-turbo', 'gpt-4-vision', 'gpt-4.1', 'gpt-4', 'claude-3-5-sonnet', 'claude-3-7-sonnet', 'claude-3', 'gemini-2.5-flash', 'gemini-pro-vision', 'gemini'];
    const modelName = (providerConfig?.model || '').toLowerCase();
    const hasVisionModel = visionModels.some(visionModel => {
      const normalizedVisionModel = visionModel.toLowerCase().replace(/\s+/g, '-');
      return modelName.includes(normalizedVisionModel) || normalizedVisionModel.includes(modelName);
    });
    
    log.debug(`[LLMVisionAnalyzer] Checking vision model: ${modelName}, hasVisionModel: ${hasVisionModel}, apiKey: ${!!providerConfig?.apiKey}`);

    if (!hasVisionModel || !providerConfig?.apiKey) {
      log.info(`[LLMVisionAnalyzer] Vision model not available (hasVisionModel: ${hasVisionModel}, hasApiKey: ${!!providerConfig?.apiKey}), using heuristic analysis`);
      return analyzeWithHeuristics(elements, currentUrl, taskContext);
    }

    // Prepare element summary for LLM
    const elementSummary = elements.slice(0, 20).map(e => 
      `Index ${e.index}: ${e.label}${e.ariaLabel ? ` (${e.ariaLabel})` : ''}`
    ).join('\n');

    // Call LLM vision API
    const analysis = await callLLMVisionAPI(
      screenshotBase64,
      elementSummary,
      currentUrl,
      taskContext,
      providerConfig
    );

    return analysis;
  } catch (error) {
    log.error('[LLMVisionAnalyzer] Error in LLM vision analysis:', error);
    // Fallback to heuristics
    return analyzeWithHeuristics(elements, currentUrl, taskContext);
  }
}

/**
 * Call LLM Vision API based on provider
 */
async function callLLMVisionAPI(
  screenshotBase64: string,
  elementSummary: string,
  currentUrl: string,
  taskContext: string | undefined,
  providerConfig: any
): Promise<LLMVisionAnalysisResult> {
  const prompt = `You are analyzing a browser screenshot to help an AI agent complete a task.

Current URL: ${currentUrl}
Task: ${taskContext || "Complete the user's request"}

Available interactive elements:
${elementSummary}

Analyze the screenshot and provide:
1. Current page state (what page is this, what's visible)
2. Next action the agent should take (click, type, scroll, wait, navigate, human_interact, or none)
3. Target element (by index number from the list above)
4. Reason for this action
5. Confidence level (0-1)
6. Whether the agent appears stuck in a loop
7. Whether human help is needed
8. List of 2-3 suggested next steps

Respond in JSON format:
{
  "pageState": "description",
  "nextAction": {
    "action": "click|type|scroll|wait|navigate|human_interact|none",
    "target": "element index or description",
    "reason": "why this action",
    "confidence": 0.0-1.0
  },
  "isStuck": true/false,
  "requiresHumanHelp": true/false,
  "suggestions": ["suggestion1", "suggestion2"]
}`;

  try {
    // For OpenAI/GPT-4 Vision
    if (providerConfig.provider === 'openai' || providerConfig.model?.includes('gpt')) {
      return await callOpenAIVision(screenshotBase64, prompt, providerConfig);
    }

    // For Anthropic Claude
    if (providerConfig.provider === 'anthropic' || providerConfig.model?.includes('claude')) {
      return await callClaudeVision(screenshotBase64, prompt, providerConfig);
    }

    // For Google Gemini
    if (providerConfig.provider === 'google' || providerConfig.model?.includes('gemini')) {
      return await callGeminiVision(screenshotBase64, prompt, providerConfig);
    }

    // Fallback
    log.warn('[LLMVisionAnalyzer] Vision model not supported, using heuristics');
    return analyzeWithHeuristics([], currentUrl, taskContext);
  } catch (error) {
    log.error('[LLMVisionAnalyzer] LLM vision API call failed:', error);
    throw error;
  }
}

/**
 * Call OpenAI GPT-4 Vision API
 */
async function callOpenAIVision(
  screenshotBase64: string,
  prompt: string,
  config: any
): Promise<LLMVisionAnalysisResult> {
  // Map model names to valid OpenAI vision models
  // gpt-4.1, gpt-4, gpt-4-turbo -> gpt-4o (latest vision model)
  const modelName = (config.model || 'gpt-4o').toLowerCase();
  let openaiModel = 'gpt-4o'; // Default to latest vision model
  
  if (modelName.includes('gpt-4o') || modelName === 'gpt-4o') {
    openaiModel = 'gpt-4o';
  } else if (modelName.includes('gpt-4-turbo')) {
    openaiModel = 'gpt-4-turbo';
  } else if (modelName.includes('gpt-4.1') || modelName.includes('gpt-4')) {
    // Map gpt-4.1 and generic gpt-4 to gpt-4o (latest vision-capable model)
    openaiModel = 'gpt-4o';
  } else {
    // Fallback to gpt-4o for any other GPT-4 variant
    openaiModel = 'gpt-4o';
  }
  
  log.info(`[LLMVisionAnalyzer] Using OpenAI model: ${openaiModel} (mapped from ${config.model})`);
  
  // Ensure screenshot is in correct format (remove data: prefix if present, we'll add it)
  const imageData = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
  const imageUrl = `data:image/png;base64,${imageData}`;
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: openaiModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `OpenAI API error: ${response.statusText}`;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = `OpenAI API error: ${errorData.error?.message || response.statusText}`;
      log.error(`[LLMVisionAnalyzer] OpenAI API error details:`, errorData);
    } catch (e) {
      log.error(`[LLMVisionAnalyzer] OpenAI API error response:`, errorText);
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || '{}';
  
  try {
    const analysis = JSON.parse(content);
    return {
      pageState: analysis.pageState || 'Unknown',
      nextAction: {
        action: analysis.nextAction?.action || 'none',
        target: analysis.nextAction?.target,
        reason: analysis.nextAction?.reason || '',
        confidence: analysis.nextAction?.confidence || 0.5
      },
      isStuck: analysis.isStuck || false,
      requiresHumanHelp: analysis.requiresHumanHelp || false,
      suggestions: analysis.suggestions || []
    };
  } catch (parseError) {
    log.warn('[LLMVisionAnalyzer] Failed to parse LLM response, using heuristics');
    return analyzeWithHeuristics([], '', '');
  }
}

/**
 * Call Anthropic Claude Vision API
 */
async function callClaudeVision(
  screenshotBase64: string,
  prompt: string,
  config: any
): Promise<LLMVisionAnalysisResult> {
  // Remove data: prefix if present for Claude
  const imageData = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.model || 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: imageData
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text || '{}';
  
  try {
    const analysis = JSON.parse(content);
    return {
      pageState: analysis.pageState || 'Unknown',
      nextAction: {
        action: analysis.nextAction?.action || 'none',
        target: analysis.nextAction?.target,
        reason: analysis.nextAction?.reason || '',
        confidence: analysis.nextAction?.confidence || 0.5
      },
      isStuck: analysis.isStuck || false,
      requiresHumanHelp: analysis.requiresHumanHelp || false,
      suggestions: analysis.suggestions || []
    };
  } catch (parseError) {
    log.warn('[LLMVisionAnalyzer] Failed to parse Claude response, using heuristics');
    return analyzeWithHeuristics([], '', '');
  }
}

/**
 * Call Google Gemini Vision API
 */
async function callGeminiVision(
  screenshotBase64: string,
  prompt: string,
  config: any
): Promise<LLMVisionAnalysisResult> {
  // Remove data: prefix if present for Gemini
  const imageData = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model || 'gemini-2.0-flash-exp'}:generateContent?key=${config.apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt
            },
            {
              inline_data: {
                mime_type: 'image/png',
                data: imageData
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 500
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.candidates[0]?.content?.parts[0]?.text || '{}';
  
  try {
    const analysis = JSON.parse(content);
    return {
      pageState: analysis.pageState || 'Unknown',
      nextAction: {
        action: analysis.nextAction?.action || 'none',
        target: analysis.nextAction?.target,
        reason: analysis.nextAction?.reason || '',
        confidence: analysis.nextAction?.confidence || 0.5
      },
      isStuck: analysis.isStuck || false,
      requiresHumanHelp: analysis.requiresHumanHelp || false,
      suggestions: analysis.suggestions || []
    };
  } catch (parseError) {
    log.warn('[LLMVisionAnalyzer] Failed to parse Gemini response, using heuristics');
    return analyzeWithHeuristics([], '', '');
  }
}

/**
 * Fallback heuristic analysis when LLM is not available
 */
function analyzeWithHeuristics(
  elements: Array<{ index: number; label: string }>,
  currentUrl: string,
  taskContext?: string
): LLMVisionAnalysisResult {
  // Simple heuristic: if we have elements, suggest clicking the first interactive one
  const nextAction = elements.length > 0 
    ? { action: 'click' as const, target: `element ${elements[0].index}`, reason: 'First available element', confidence: 0.5 }
    : { action: 'none' as const, target: undefined, reason: 'No elements found', confidence: 0.3 };

  return {
    pageState: `Page at ${currentUrl} with ${elements.length} interactive elements`,
    nextAction,
    isStuck: false,
    requiresHumanHelp: false,
    suggestions: elements.length > 0 
      ? [`Click element ${elements[0].index} (${elements[0].label})`]
      : ['Take another screenshot to see page state']
  };
}

