import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';

afterEach(() => {
  vi.unstubAllGlobals();
});

function createSSEStream(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < frames.length) {
        controller.enqueue(encoder.encode(frames[i]));
        i++;
      } else {
        controller.close();
      }
    },
  });
}

function createControllableSSEStream() {
  let controllerRef: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  const encoder = new TextEncoder();
  return {
    stream,
    push: (text: string) => controllerRef.enqueue(encoder.encode(text)),
    close: () => controllerRef.close(),
  };
}

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

function mockGenerateSuccess(code = 'const A = () => null;') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => ({
      ok: true,
      body: createSSEStream([`data: ${JSON.stringify({ type: 'done', code })}\n\n`]),
    })),
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

describe('useComponentGenerator - 스트리밍', () => {
  it('error 이벤트가 도착하면 컴포넌트를 제거하고 에러 메시지를 설정한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => ({
        ok: true,
        body: createSSEStream([`data: ${JSON.stringify({ type: 'error', message: '실패했습니다' })}\n\n`]),
      })),
    );

    const { result } = renderHook(() => useComponentGenerator());

    await act(async () => {
      await result.current.generate('프롬프트', 'key', 'anthropic');
    });

    expect(result.current.components).toHaveLength(0);
    expect(result.current.error).toBe('실패했습니다');
  });

  it('delta 이벤트가 도착하는 즉시(= done 이전에) 코드가 중간 상태로 반영된다', async () => {
    const { stream, push, close } = createControllableSSEStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream }));

    const { result } = renderHook(() => useComponentGenerator());

    let generatePromise: Promise<void> = Promise.resolve();
    act(() => {
      generatePromise = result.current.generate('프롬프트', 'key', 'anthropic');
    });

    await act(async () => {
      push(`data: ${JSON.stringify({ type: 'delta', text: 'const A' })}\n\n`);
      await flushMicrotasks();
    });
    expect(result.current.components[0].code).toBe('const A');
    expect(result.current.components[0].isStreaming).toBe(true);

    await act(async () => {
      push(`data: ${JSON.stringify({ type: 'delta', text: ' = 1;' })}\n\n`);
      await flushMicrotasks();
    });
    expect(result.current.components[0].code).toBe('const A = 1;');

    await act(async () => {
      push(`data: ${JSON.stringify({ type: 'done', code: 'const A = 1;\n\nrender(<A />);' })}\n\n`);
      close();
      await generatePromise;
    });

    expect(result.current.components[0].code).toBe('const A = 1;\n\nrender(<A />);');
    expect(result.current.components[0].isStreaming).toBe(false);
  });

  it('SSE 프레임이 청크 경계에서 쪼개져 도착해도 정상적으로 파싱한다', async () => {
    const fullFrame = `data: ${JSON.stringify({ type: 'done', code: 'const A = 1;\n\nrender(<A />);' })}\n\n`;
    const splitPoint = Math.floor(fullFrame.length / 2);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => ({
        ok: true,
        body: createSSEStream([fullFrame.slice(0, splitPoint), fullFrame.slice(splitPoint)]),
      })),
    );

    const { result } = renderHook(() => useComponentGenerator());

    await act(async () => {
      await result.current.generate('프롬프트', 'key', 'anthropic');
    });

    expect(result.current.components[0].code).toBe('const A = 1;\n\nrender(<A />);');
    expect(result.current.components[0].isStreaming).toBe(false);
  });

  it('res.ok가 false면 JSON 에러 메시지를 읽어 컴포넌트를 추가하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'API 키가 필요합니다' }),
      }),
    );

    const { result } = renderHook(() => useComponentGenerator());

    await act(async () => {
      await result.current.generate('프롬프트', 'key', 'anthropic');
    });

    expect(result.current.components).toHaveLength(0);
    expect(result.current.error).toBe('API 키가 필요합니다');
  });

  it('done/error 이벤트 없이 스트림이 끝나면 에러로 처리하고 컴포넌트를 제거한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => ({
        ok: true,
        body: createSSEStream([`data: ${JSON.stringify({ type: 'delta', text: 'const A' })}\n\n`]),
      })),
    );

    const { result } = renderHook(() => useComponentGenerator());

    await act(async () => {
      await result.current.generate('프롬프트', 'key', 'anthropic');
    });

    expect(result.current.components).toHaveLength(0);
    expect(result.current.error).toBeTruthy();
  });
});
