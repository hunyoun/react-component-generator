import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockGenerateSuccess(code = 'const A = () => null;') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ code }),
    }),
  );
}

describe('useComponentGenerator - 생성된 컴포넌트 영속화', () => {
  it('생성한 컴포넌트는 localStorage에 저장돼 훅을 다시 마운트해도 유지된다', async () => {
    mockGenerateSuccess();
    const { result, unmount } = renderHook(() => useComponentGenerator());

    await act(async () => {
      await result.current.generate('프로필 카드', 'key', 'anthropic');
    });

    expect(result.current.components).toHaveLength(1);
    unmount();

    const { result: reMounted } = renderHook(() => useComponentGenerator());
    expect(reMounted.current.components).toHaveLength(1);
    expect(reMounted.current.components[0].prompt).toBe('프로필 카드');
    expect(reMounted.current.components[0].createdAt).toBeInstanceOf(Date);
  });
});

describe('useComponentGenerator - 프롬프트 히스토리', () => {
  it('생성을 요청하면 프롬프트가 히스토리 맨 앞에 추가된다', async () => {
    mockGenerateSuccess();
    const { result } = renderHook(() => useComponentGenerator());

    await act(async () => {
      await result.current.generate('첫 프롬프트', 'key', 'anthropic');
    });

    expect(result.current.promptHistory[0]).toBe('첫 프롬프트');
  });

  it('같은 프롬프트를 다시 요청하면 중복 없이 맨 앞으로 옮긴다', async () => {
    mockGenerateSuccess();
    const { result } = renderHook(() => useComponentGenerator());

    await act(async () => {
      await result.current.generate('A', 'key', 'anthropic');
    });
    await act(async () => {
      await result.current.generate('B', 'key', 'anthropic');
    });
    await act(async () => {
      await result.current.generate('A', 'key', 'anthropic');
    });

    expect(result.current.promptHistory).toEqual(['A', 'B']);
  });

  it('히스토리는 최대 20개까지만 유지한다', async () => {
    mockGenerateSuccess();
    const { result } = renderHook(() => useComponentGenerator());

    for (let i = 0; i < 21; i++) {
      await act(async () => {
        await result.current.generate(`prompt-${i}`, 'key', 'anthropic');
      });
    }

    expect(result.current.promptHistory).toHaveLength(20);
    expect(result.current.promptHistory[0]).toBe('prompt-20');
    expect(result.current.promptHistory).not.toContain('prompt-0');
  });

  it('히스토리는 localStorage에 저장돼 훅을 다시 마운트해도 유지된다', async () => {
    mockGenerateSuccess();
    const { result, unmount } = renderHook(() => useComponentGenerator());

    await act(async () => {
      await result.current.generate('유지되는 프롬프트', 'key', 'anthropic');
    });
    unmount();

    const { result: reMounted } = renderHook(() => useComponentGenerator());
    await waitFor(() => {
      expect(reMounted.current.promptHistory).toEqual(['유지되는 프롬프트']);
    });
  });
});
