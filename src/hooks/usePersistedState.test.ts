import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedState } from './usePersistedState';

describe('usePersistedState', () => {
  it('저장된 값이 없으면 initialValue로 시작한다', () => {
    const { result } = renderHook(() => usePersistedState('k', 'default'));
    expect(result.current[0]).toBe('default');
  });

  it('저장된 값이 있으면 그 값으로 시작한다', () => {
    localStorage.setItem('k', JSON.stringify('saved'));
    const { result } = renderHook(() => usePersistedState('k', 'default'));
    expect(result.current[0]).toBe('saved');
  });

  it('setValue로 갱신하면 localStorage에도 반영된다', () => {
    const { result } = renderHook(() => usePersistedState('k', 'default'));

    act(() => {
      result.current[1]('updated');
    });

    expect(result.current[0]).toBe('updated');
    expect(localStorage.getItem('k')).toBe(JSON.stringify('updated'));
  });

  it('reviver가 있으면 로드된 값에 적용한다', () => {
    localStorage.setItem('k', JSON.stringify('3'));
    const { result } = renderHook(() =>
      usePersistedState('k', '0', (v) => String(Number(v) + 1)),
    );
    expect(result.current[0]).toBe('4');
  });
});
