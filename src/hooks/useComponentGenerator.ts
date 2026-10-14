import { useState, useCallback } from 'react';
import type { GeneratedComponent, Provider } from '../types';
import { usePersistedState } from './usePersistedState';
import { STORAGE_KEYS } from '../utils/storage';

const MAX_PROMPT_HISTORY = 20;

function reviveComponents(components: GeneratedComponent[]): GeneratedComponent[] {
  return components.map((c) => ({ ...c, createdAt: new Date(c.createdAt) }));
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
  const [components, setComponents] = usePersistedState<GeneratedComponent[]>(
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

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider) => {
    setPromptHistory((prev) => [prompt, ...prev.filter((p) => p !== prompt)].slice(0, MAX_PROMPT_HISTORY));
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate component');
      }

      const newComponent: GeneratedComponent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        prompt,
        code: data.code,
        createdAt: new Date(),
      };

      setComponents((prev) => [newComponent, ...prev]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [setComponents, setPromptHistory]);

  const removeComponent = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, [setComponents]);

  const clearAll = useCallback(() => {
    setComponents([]);
  }, [setComponents]);

  return { components, promptHistory, isLoading, error, generate, removeComponent, clearAll };
}
