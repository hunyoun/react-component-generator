export interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

/** 누적 버퍼를 완결된 SSE 프레임들과 남은 버퍼로 분리한다. */
export function splitSSEFrames(buffer: string): { frames: string[]; rest: string } {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  return { frames: parts, rest };
}

/** SSE 프레임에서 data 라인을 파싱해 이벤트 객체를 반환한다. */
export function parseSSEEvent(frame: string): SSEEvent | null {
  const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
  if (!dataLine) return null;

  try {
    const data = JSON.parse(dataLine.slice(5).trim()) as Partial<SSEEvent>;
    if (typeof data.type !== 'string') return null;
    return data as SSEEvent;
  } catch {
    return null;
  }
}
