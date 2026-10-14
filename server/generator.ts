// AI 응답 텍스트를 react-live에서 실행 가능한 코드로 정규화하는 순수 함수들.
// 부수효과(Bun.serve 등)가 없어 단위 테스트가 가능하다.

/** 응답에 섞여 나온 마크다운 코드펜스(```)를 제거한다. */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:jsx|tsx|javascript|typescript)?\n?/gm, '')
    .replace(/```$/gm, '')
    .trim();
}

/**
 * react-live(noInline)는 `render(...)` 호출이 있어야 미리보기를 그린다.
 * 응답에 render 호출이 없으면 첫 컴포넌트 선언을 찾아 자동으로 주입한다.
 */
export function ensureRenderCall(code: string): string {
  if (/\brender\s*\(/.test(code)) return code;

  const match = code.match(/(?:const|function)\s+([A-Z]\w+)/);
  if (match) {
    return `${code}\n\nrender(<${match[1]} />);`;
  }
  return code;
}

/** 누적 버퍼를 완결된 SSE 프레임들과 남은 버퍼로 분리한다. CRLF/CR 구분자도 허용한다. */
export function splitSSEFrames(buffer: string): { frames: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  return { frames: parts, rest };
}

/** 하나의 SSE 프레임에서 data 라인만 추출해 이어붙인다. event 등 다른 필드는 무시한다. */
export function getSSEDataPayload(frame: string): string | null {
  const dataLines = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());

  return dataLines.length > 0 ? dataLines.join('\n') : null;
}

/** Anthropic 스트리밍 이벤트에서 텍스트 델타를 추출한다. */
export function extractAnthropicDeltaText(dataPayload: string): string {
  try {
    const data = JSON.parse(dataPayload) as {
      type?: string;
      delta?: { type?: string; text?: string };
    };
    if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
      return data.delta.text ?? '';
    }
    return '';
  } catch {
    return '';
  }
}

/** Gemini 스트리밍 청크에서 텍스트 델타를 추출한다. */
export function extractGoogleDeltaText(dataPayload: string): string {
  try {
    const data = JSON.parse(dataPayload) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const parts = data.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts.map((part) => part.text ?? '').join('');
  } catch {
    return '';
  }
}

/** Gemini 스트리밍 청크가 MAX_TOKENS로 종료됐는지 확인한다. */
export function isGoogleMaxTokensFinish(dataPayload: string): boolean {
  try {
    const data = JSON.parse(dataPayload) as {
      candidates?: Array<{ finishReason?: string }>;
    };
    return data.candidates?.[0]?.finishReason === 'MAX_TOKENS';
  } catch {
    return false;
  }
}

/** 클라이언트로 보낼 SSE data 프레임 문자열을 만든다. */
export function formatSSEEvent(payload: object): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** Anthropic 스트림 중간에 전송되는 에러 이벤트에서 메시지를 추출한다. */
export function extractAnthropicErrorMessage(dataPayload: string): string | null {
  try {
    const data = JSON.parse(dataPayload) as {
      type?: string;
      error?: { message?: string };
    };
    if (data.type !== 'error') return null;
    return data.error?.message ?? 'Anthropic stream error';
  } catch {
    return null;
  }
}

/** Gemini 스트림 중간에 전송되는 에러 청크에서 메시지를 추출한다. */
export function extractGoogleErrorMessage(dataPayload: string): string | null {
  try {
    const data = JSON.parse(dataPayload) as {
      error?: { message?: string };
    };
    if (!data.error) return null;
    return data.error.message ?? 'Gemini stream error';
  } catch {
    return null;
  }
}
