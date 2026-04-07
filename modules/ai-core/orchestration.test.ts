import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orchestrateConversation } from '~/ai-core/orchestration.server.js';
import { evaluateCompliance } from '~/ai-core/compliance-gate.server.js';
import { MemoryOS } from '~/rag-memory/memory-os.server.js';
import { NvidiaNIM } from '~/ai-core/nvidia-nim.server.js';
import { runTTS } from '~/tts-lipsync/tts.server.js';
import { RAGPipeline } from '~/rag-memory/rag-pipeline.server.js';

// Mock dependencies
vi.mock('~/ai-core/compliance-gate.server.js', () => ({
  evaluateCompliance: vi.fn(),
  buildComplianceInterruptionText: vi.fn((reason) => `Compliance Error: ${reason}`),
}));

vi.mock('~/rag-memory/memory-os.server.js', () => ({
  MemoryOS: {
    retrieveEpisodeMemories: vi.fn(),
    getRepProfile: vi.fn(),
  },
}));

vi.mock('~/ai-core/nvidia-nim.server.js', () => ({
  NvidiaNIM: {
    generateResponse: vi.fn(),
    generateLipSync: vi.fn(),
    MODELS: {
      LLM: 'meta/llama-3.1-8b-instruct',
      EMBEDDING: 'NV-Embed-QA',
    },
  },
}));

vi.mock('~/tts-lipsync/tts.server.js', () => ({
  runTTS: vi.fn(),
}));

vi.mock('~/rag-memory/rag-pipeline.server.js', () => ({
  RAGPipeline: {
    buildAugmentedPrompt: vi.fn(() => 'System: You are ALIA...'),
  },
}));

describe('Orchestration LangGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should complete the full pipeline for compliant messages', async () => {
    // Setup mocks
    (evaluateCompliance as any).mockResolvedValue({ is_compliant: true });
    (MemoryOS.retrieveEpisodeMemories as any).mockResolvedValue([
      { session_date: '2026-03-01', memory_text: 'Prior struggle with pricing' }
    ]);
    (MemoryOS.getRepProfile as any).mockResolvedValue({ rep_id: 'rep-123', name: 'John Doe' });
    (RAGPipeline.buildAugmentedPrompt as any).mockReturnValue('System: You are ALIA...');
    (NvidiaNIM.generateResponse as any).mockResolvedValue({ text: 'Hello, I remember your pricing struggle.' });
    (runTTS as any).mockResolvedValue({ 
      audioBase64: 'mock-audio', 
      duration: 2.5, 
      isMock: true 
    });
    (NvidiaNIM.generateLipSync as any).mockResolvedValue([{ timestamp: 0, blendshapes: {} }]);

    const result = await orchestrateConversation('Help me with pricing', 'rep-123');

    expect(result.isCompliant).toBe(true);
    expect(result.memoryContext).toContain('Prior struggle');
    expect(result.llmResponse).toBe('Hello, I remember your pricing struggle.');
    expect(result.audioBase64).toBe('mock-audio');
    expect(result.isMock).toBe(true);
    expect(result.blendshapes).toBeDefined();
    expect(result.stage).toBe('complete');
  });

  it('should short-circuit and return compliance error for non-compliant messages', async () => {
    (evaluateCompliance as any).mockResolvedValue({ is_compliant: false, reason: 'Off-label claim' });

    const result = await orchestrateConversation('This drug cures everything', 'rep-123');

    expect(result.isCompliant).toBe(false);
    expect(result.llmResponse).toContain('Compliance Error: Off-label claim');
    // Memory and subsequent nodes should be handled by the graph logic
    expect(NvidiaNIM.generateResponse).not.toHaveBeenCalled();
  });
});
