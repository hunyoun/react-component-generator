export const STORAGE_KEYS = {
  API_KEY: 'rcg:apiKey',
  PROVIDER: 'rcg:provider',
  PROMPT_HISTORY: 'rcg:promptHistory',
  COMPONENTS: 'rcg:components',
} as const;

export function loadJSON<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 공간 부족 등으로 실패해도 앱 동작에는 영향을 주지 않는다.
  }
}
