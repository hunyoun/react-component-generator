export const MAX_PROMPT_LENGTH = 500;

export function validatePromptLength(prompt: string): string | null {
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return `프롬프트는 ${MAX_PROMPT_LENGTH}자를 넘을 수 없습니다. (현재 ${prompt.length}자)`;
  }
  return null;
}
