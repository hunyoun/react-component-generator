import { describe, it, expect, vi } from 'vitest';
import { loadJSON, saveJSON } from './storage';

describe('loadJSON', () => {
  it('키가 없으면 fallback을 반환한다', () => {
    expect(loadJSON('missing-key', 'fallback')).toBe('fallback');
  });

  it('저장된 값이 있으면 파싱해서 반환한다', () => {
    localStorage.setItem('k', JSON.stringify({ a: 1 }));
    expect(loadJSON('k', { a: 0 })).toEqual({ a: 1 });
  });

  it('저장된 값이 손상된 JSON이면 fallback을 반환한다', () => {
    localStorage.setItem('k', '{broken');
    expect(loadJSON('k', 'fallback')).toBe('fallback');
  });
});

describe('saveJSON', () => {
  it('값을 JSON 문자열로 저장한다', () => {
    saveJSON('k', { a: 1 });
    expect(localStorage.getItem('k')).toBe(JSON.stringify({ a: 1 }));
  });

  it('저장 중 에러가 나도 던지지 않는다', () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    expect(() => saveJSON('k', 'v')).not.toThrow();

    setItemSpy.mockRestore();
  });
});
