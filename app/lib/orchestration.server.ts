/**
 * ALIA 2.0 - LangChain Orchestration Server
 * Coordinates RAG, compliance checking, and TTS generation
 * 
 * Architecture:
 * 1. Input → RAG Pipeline (retrieve context)
 * 2. Context → LLM (generate response)
 * 3. Response → Compliance Agent (validate)
 * 4. Validated → TTS Agent (generate audio)
 */

import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
} from '@langchain/core/messages';
import {
  createReactAgent,
  AgentExecutor,
} from '@langchain/langgraph/prebuilt';
import { RAGPipeline, type RAGContext } from './rag-pipeline.server';
import { config } from './providers';

// =====================================================
// Types
// =====================================================

export interface OrchestrationInput {
  rep_id: string;
  message: string;
  session_id: string;
  history?: ChatMessage[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OrchestrationOutput {
  response: string;
  visemes: VisemeData[];
  metrics: SessionMetrics;
  compliance: ComplianceResult;
  context: RAGContext;
}

export interface VisemeData {
  time: number;
  viseme: string;
}

export interface SessionMetrics {
  accuracy: number;
  compliance: number;
  confidence: number;
  clarity: number;
}

export interface ComplianceResult {
  passed: boolean;
  violations: ComplianceViolation[];
  warnings: string[];
}

export interface ComplianceViolation {
  rule: string;
  severity: 'critical' | 'warning';
  message: string;
}

// =====================================================
// LLM Initialization
// =====================================================

function getLLM() {
  if (config.llm.provider === 'groq' && config.llm.groq.apiKey) {
    return new ChatGroq({
      apiKey: config.llm.groq.apiKey,
      model: config.llm.groq.model,
      temperature: 0.7,
      maxTokens: 1024,
    });
  }
  
  // Fallback to OpenAI (if configured)
  if (process.env.OPENAI_API_KEY) {
    return new ChatOpenAI({
      model: 'gpt-4-turbo',
      temperature: 0.7,
      maxTokens: 1024,
    });
  }
  
  throw new Error('No LLM provider configured');
}

// =====================================================
// Compliance Agent
// =====================================================

const COMPLIANCE_RULES = [
  {
    id: 'off_label',
    pattern: /(off[- ]label|unapproved|not FDA|not approved|not indicated)/i,
    severity: 'critical' as const,
    message: 'Off-label promotion detected - cannot suggest unapproved uses',
  },
  {
    id: 'safety_claim',
    pattern: /(completely safe|no side effects|guaranteed|cure|eliminate risk)/i,
    severity: 'critical' as const,
    message: 'Absolute safety claims are prohibited',
  },
  {
    id: 'competitor',
    pattern: /(better than|outperforms|superior to|beats|rivals|competitor)/i,
    severity: 'warning' as const,
    message: 'Avoid direct competitor comparisons without evidence',
  },
  {
    id: 'pricing',
    pattern: /(price|cost|discount|free|guaranteed|rebate)/i,
    severity: 'warning' as const,
    message: 'Pricing discussions should follow company guidelines',
  },
  {
    id: 'patient_identity',
    pattern: /(patient name|patient John|patient Jane|patient Mike)/i,
    severity: 'critical' as const,
    message: 'Never mention specific patient identities',
  },
];

/**
 * Check response for compliance violations
 */
export function checkCompliance(response: string): ComplianceResult {
  const violations: ComplianceViolation[] = [];
  const warnings: string[] = [];
  
  for (const rule of COMPLIANCE_RULES) {
    if (rule.pattern.test(response)) {
      violations.push({
        rule: rule.id,
        severity: rule.severity,
        message: rule.message,
      });
    }
  }
  
  return {
    passed: !violations.some((v) => v.severity === 'critical'),
    violations,
    warnings,
  };
}

/**
 * Rewrite response to remove compliance issues
 */
async function rewriteForCompliance(response: string): Promise<string> {
  const llm = getLLM();
  
  const prompt = `You are a compliance editor for a medical sales training system.
Review the following response and rewrite it to remove any compliance issues.
Keep the helpful educational content but remove or rephrase problematic statements.

Original response:
${response}

Provide a compliance-safe version:`;

  const result = await llm.invoke([new HumanMessage(prompt)]);
  
  return result.content instanceof AIMessage 
    ? result.content.content 
    : String(result.content);
}

// =====================================================
// TTS Preparation
// =====================================================

/**
 * Generate placeholder visemes for lip-sync
 * In production, this would use Azure Speech SDK
 */
export function generateVisemes(text: string): VisemeData[] {
  const words = text.split(/\s+/);
  const visemes: VisemeData[] = [];
  let time = 0;
  
  // Simple phoneme approximation
  const visemeMap: Record<string, string> = {
    a: 'AA', e: 'EH', i: 'IH', o: 'OW', u: 'UH',
    b: 'PP', d: 'DD', f: 'FF', g: 'GG', h: 'HH',
    k: 'KK', l: 'LL', m: 'MM', n: 'NN', p: 'PP',
    r: 'RR', s: 'SS', t: 'DD', v: 'FF', w: 'UW',
    y: 'IY', z: 'SS', th: 'TH', sh: 'SH', ch: 'CH',
  };
  
  for (const word of words) {
    const firstChar = word.toLowerCase()[0] || 's';
    const viseme = visemeMap[firstChar] || 'sil';
    
    time += word.length * 0.05; // Approximate duration
    visemes.push({ time, viseme });
  }
  
  return visemes;
}

// =====================================================
// Main Orchestration
// =====================================================

/**
 * Execute full orchestration pipeline
 */
export async function orchestrate(input: OrchestrationInput): Promise<OrchestrationOutput> {
  console.log(`[Orchestration] Processing for rep ${input.rep_id}`);
  
  // Step 1: Execute RAG pipeline
  const context = await RAGPipeline.executeRAG(input.rep_id, input.message);
  
  // Step 2: Build chat history for context
  const messages = [
    new SystemMessage(`You are ALIA, an AI-powered medical sales training assistant.
    
Your role:
- Help reps practice their pitch and handle objections
- Provide constructive feedback on communication skills
- Ensure all medical information is accurate and compliant
- Adapt your teaching style to each rep's learning profile

Remember:
- Be encouraging but honest about areas needing improvement
- Reference past sessions when relevant
- Keep responses focused and actionable
- Always prioritize patient safety and compliance`),
  ];
  
  // Add history
  if (input.history) {
    for (const msg of input.history.slice(-10)) {
      if (msg.role === 'user') {
        messages.push(new HumanMessage(msg.content));
      } else {
        messages.push(new AIMessage(msg.content));
      }
    }
  }
  
  // Add current message
  messages.push(new HumanMessage(input.message));
  
  // Step 3: Generate response with LLM
  const llm = getLLM();
  const llmResponse = await llm.invoke(messages);
  
  let responseText = llmResponse.content instanceof AIMessage 
    ? llmResponse.content.content 
    : String(llmResponse.content);
  
  // Step 4: Check compliance
  let compliance = checkCompliance(responseText);
  
  // If critical violations, rewrite
  if (!compliance.passed) {
    console.log('[Orchestration] Compliance issues detected, rewriting...');
    responseText = await rewriteForCompliance(responseText);
    compliance = checkCompliance(responseText);
  }
  
  // Step 5: Generate visemes
  const visemes = generateVisemes(responseText);
  
  // Step 6: Calculate metrics (placeholder - in production, analyze actual speech)
  const metrics: SessionMetrics = {
    accuracy: 75 + Math.random() * 20,
    compliance: compliance.passed ? 90 + Math.random() * 10 : 60 + Math.random() * 20,
    confidence: 70 + Math.random() * 25,
    clarity: 75 + Math.random() * 20,
  };
  
  console.log(`[Orchestration] Complete - ${responseText.length} chars, compliance: ${compliance.passed ? 'passed' : 'issues'}`);
  
  return {
    response: responseText,
    visemes,
    metrics,
    compliance,
    context,
  };
}

// =====================================================
// Session Analysis
// =====================================================

/**
 * Analyze a completed training session
 */
export async function analyzeSession(params: {
  rep_id: string;
  session_id: string;
  transcript: string;
  scores: {
    accuracy: number;
    compliance: number;
    confidence: number;
    clarity: number;
  };
}): Promise<{ success: boolean; memory_id?: string; error?: string }> {
  // Store episode memory
  const result = await RAGPipeline.storeEpisodeMemory({
    rep_id: params.rep_id,
    session_id: params.session_id,
    episode_text: params.transcript,
    accuracy: params.scores.accuracy,
    compliance: params.scores.compliance,
    confidence: params.scores.confidence,
  });
  
  return result;
}

// =====================================================
// Export
// =====================================================

export const Orchestration = {
  orchestrate,
  analyzeSession,
  checkCompliance,
  generateVisemes,
};
