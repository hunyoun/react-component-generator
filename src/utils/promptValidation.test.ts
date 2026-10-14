import { describe, it, expect } from 'vitest';
import { validatePromptLength, MAX_PROMPT_LENGTH } from './promptValidation';

describe('validatePromptLength', () => {
  it('빈 문자열은 유효하다 (에러 없음)', () => {
    expect(validatePromptLength('')).toBeNull();
  });

  it(`${MAX_PROMPT_LENGTH}자 이하는 유효하다`, () => {
    expect(validatePromptLength('a'.repeat(MAX_PROMPT_LENGTH))).toBeNull();
  });

  it(`${MAX_PROMPT_LENGTH}자를 초과하면 에러 메시지를 반환한다`, () => {
    const result = validatePromptLength('a'.repeat(MAX_PROMPT_LENGTH + 1));
    expect(result).not.toBeNull();
    expect(result).toContain(String(MAX_PROMPT_LENGTH));
  });

  it('초과분 에러 메시지에 현재 글자 수를 포함한다', () => {
    const result = validatePromptLength('a'.repeat(MAX_PROMPT_LENGTH + 10));
    expect(result).toContain(String(MAX_PROMPT_LENGTH + 10));
  });
});
