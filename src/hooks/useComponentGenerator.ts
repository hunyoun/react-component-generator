import { useState, useCallback } from 'react';
import type { GeneratedComponent, Provider } from '../types';
import { usePersistedState } from './usePersistedState';
import { STORAGE_KEYS } from '../utils/storage';
import { splitSSEFrames, parseSSEEvent } from '../utils/sse';

const MAX_PROMPT_HISTORY = 20;

function reviveComponents(components: GeneratedComponent[]): GeneratedComponent[] {
  return components.map((c) => ({ ...c, createdAt: new Date(c.createdAt), isStreaming: false }));
}

function omitKey(record: Record<string, string>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

interface UseComponentGeneratorReturn {
  components: GeneratedComponent[];
  promptHistory: string[];
  isLoading: boolean;
  error: string | null;
  generate: (prompt: string, apiKey: string | undefined, provider: Provider) => Promise<void>;
  removeComponent: (id: string) => void;
  clearAll: () => void;
}

export function useComponentGenerator(): UseComponentGeneratorReturn {
  const [storedComponents, setStoredComponents] = usePersistedState<GeneratedComponent[]>(
    STORAGE_KEYS.COMPONENTS,
    [],
    reviveComponents,
  );
  const [promptHistory, setPromptHistory] = usePersistedState<string[]>(
    STORAGE_KEYS.PROMPT_HISTORY,
    [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 스트리밍 중인 코드는 델타마다 localStorage에 쓰지 않도록 persisted 상태와 분리해 보관한다.
  const [streamingCode, setStreamingCode] = useState<Record<string, string>>({});

  const components = storedComponents.map((c) =>
    c.isStreaming && streamingCode[c.id] !== undefined ? { ...c, code: streamingCode[c.id] } : c,
  );

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider) => {
    setPromptHistory((prev) => [prompt, ...prev.filter((p) => p !== prompt)].slice(0, MAX_PROMPT_HISTORY));
    setIsLoading(true);
    setError(null);

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setStoredComponents((prev) => [
      { id, prompt, code: '', createdAt: new Date(), isStreaming: true },
      ...prev,
    ]);
    setStreamingCode((prev) => ({ ...prev, [id]: '' }));

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate component');
      }

      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let settled = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { frames, rest } = splitSSEFrames(buffer);
        buffer = rest;

        for (const frame of frames) {
          const event = parseSSEEvent(frame);
          if (!event) continue;

          if (event.type === 'delta' && typeof event.text === 'string') {
            const text = event.text;
            setStreamingCode((prev) => ({ ...prev, [id]: (prev[id] ?? '') + text }));
          } else if (event.type === 'done' && typeof event.code === 'string') {
            settled = true;
            const code = event.code;
            setStoredComponents((prev) =>
              prev.map((c) => (c.id === id ? { ...c, code, isStreaming: false } : c)),
            );
          } else if (event.type === 'error' && typeof event.message === 'string') {
            throw new Error(event.message);
          }
        }
      }

      if (!settled) {
        throw new Error('컴포넌트 생성이 완료되지 않았습니다. 다시 시도해주세요.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setStoredComponents((prev) => prev.filter((c) => c.id !== id));
      reader?.cancel().catch(() => {});
    } finally {
      setStreamingCode((prev) => omitKey(prev, id));
      setIsLoading(false);
    }
  }, [setStoredComponents, setPromptHistory]);

  const removeComponent = useCallback((id: string) => {
    setStoredComponents((prev) => prev.filter((c) => c.id !== id));
  }, [setStoredComponents]);

  const clearAll = useCallback(() => {
    setStoredComponents([]);
  }, [setStoredComponents]);

  return { components, promptHistory, isLoading, error, generate, removeComponent, clearAll };
}
