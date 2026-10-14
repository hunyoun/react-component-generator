import { describe, it, expect } from 'vitest';
import {
  stripCodeFences,
  ensureRenderCall,
  splitSSEFrames,
  getSSEDataPayload,
  extractAnthropicDeltaText,
  extractGoogleDeltaText,
  isGoogleMaxTokensFinish,
  formatSSEEvent,
  extractAnthropicErrorMessage,
  extractGoogleErrorMessage,
} from './generator';

describe('stripCodeFences', () => {
  it('언어 태그가 붙은 코드펜스를 제거한다', () => {
    const input = '```tsx\nconst A = () => null;\n```';
    expect(stripCodeFences(input)).toBe('const A = () => null;');
  });

  it('언어 태그 없는 코드펜스도 제거한다', () => {
    const input = '```\nconst A = 1;\n```';
    expect(stripCodeFences(input)).toBe('const A = 1;');
  });

  it('펜스가 없으면 앞뒤 공백만 정리해 그대로 반환한다', () => {
    expect(stripCodeFences('  const A = 1;  ')).toBe('const A = 1;');
  });
});

describe('ensureRenderCall', () => {
  it('이미 render() 호출이 있으면 그대로 둔다', () => {
    const code = 'const Card = () => null;\nrender(<Card />);';
    expect(ensureRenderCall(code)).toBe(code);
  });

  it('const 컴포넌트 선언에 render 호출을 주입한다', () => {
    const code = 'const Card = () => null;';
    expect(ensureRenderCall(code)).toBe(`${code}\n\nrender(<Card />);`);
  });

  it('function 선언 컴포넌트에도 render 호출을 주입한다', () => {
    const code = 'function Widget() { return null; }';
    expect(ensureRenderCall(code)).toContain('render(<Widget />);');
  });

  it('대문자로 시작하는 컴포넌트 선언이 없으면 원본을 그대로 반환한다', () => {
    const code = 'const value = 42;';
    expect(ensureRenderCall(code)).toBe(code);
  });
});

describe('splitSSEFrames', () => {
  it('완결된 프레임들과 남은 버퍼를 분리한다', () => {
    const buffer = 'data: {"a":1}\n\ndata: {"a":2}\n\ndata: {"a":3';
    expect(splitSSEFrames(buffer)).toEqual({
      frames: ['data: {"a":1}', 'data: {"a":2}'],
      rest: 'data: {"a":3',
    });
  });

  it('완결된 프레임이 없으면 전체를 rest로 남긴다', () => {
    expect(splitSSEFrames('data: {"a":1}')).toEqual({ frames: [], rest: 'data: {"a":1}' });
  });

  it('CRLF(\\r\\n\\r\\n) 구분자도 프레임으로 분리한다', () => {
    const buffer = 'data: {"a":1}\r\n\r\ndata: {"a":2}\r\n\r\n';
    expect(splitSSEFrames(buffer)).toEqual({
      frames: ['data: {"a":1}', 'data: {"a":2}'],
      rest: '',
    });
  });

  it('단독 CR(\\r\\r) 구분자도 프레임으로 분리한다', () => {
    const buffer = 'data: {"a":1}\r\rdata: {"a":2}\r\r';
    expect(splitSSEFrames(buffer)).toEqual({
      frames: ['data: {"a":1}', 'data: {"a":2}'],
      rest: '',
    });
  });
});

describe('getSSEDataPayload', () => {
  it('event 라인을 무시하고 data 라인만 추출한다', () => {
    const frame = 'event: content_block_delta\ndata: {"a":1}';
    expect(getSSEDataPayload(frame)).toBe('{"a":1}');
  });

  it('여러 data 라인은 줄바꿈으로 이어붙인다', () => {
    const frame = 'data: {"a":1}\ndata: {"b":2}';
    expect(getSSEDataPayload(frame)).toBe('{"a":1}\n{"b":2}');
  });

  it('data 라인이 없으면 null을 반환한다', () => {
    expect(getSSEDataPayload('event: ping')).toBeNull();
  });
});

describe('extractAnthropicDeltaText', () => {
  it('content_block_delta의 text_delta를 추출한다', () => {
    const payload = JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Hello' },
    });
    expect(extractAnthropicDeltaText(payload)).toBe('Hello');
  });

  it('다른 이벤트 타입이면 빈 문자열을 반환한다', () => {
    const payload = JSON.stringify({ type: 'message_start' });
    expect(extractAnthropicDeltaText(payload)).toBe('');
  });

  it('JSON 파싱에 실패하면 빈 문자열을 반환한다', () => {
    expect(extractAnthropicDeltaText('not json')).toBe('');
  });
});

describe('extractGoogleDeltaText', () => {
  it('candidate의 parts 텍스트를 이어붙여 반환한다', () => {
    const payload = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Hel' }, { text: 'lo' }] } }],
    });
    expect(extractGoogleDeltaText(payload)).toBe('Hello');
  });

  it('candidate가 없으면 빈 문자열을 반환한다', () => {
    expect(extractGoogleDeltaText(JSON.stringify({ candidates: [] }))).toBe('');
  });

  it('JSON 파싱에 실패하면 빈 문자열을 반환한다', () => {
    expect(extractGoogleDeltaText('not json')).toBe('');
  });
});

describe('isGoogleMaxTokensFinish', () => {
  it('finishReason이 MAX_TOKENS면 true를 반환한다', () => {
    const payload = JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS' }] });
    expect(isGoogleMaxTokensFinish(payload)).toBe(true);
  });

  it('그 외에는 false를 반환한다', () => {
    const payload = JSON.stringify({ candidates: [{ finishReason: 'STOP' }] });
    expect(isGoogleMaxTokensFinish(payload)).toBe(false);
  });

  it('JSON 파싱에 실패하면 false를 반환한다', () => {
    expect(isGoogleMaxTokensFinish('not json')).toBe(false);
  });
});

describe('formatSSEEvent', () => {
  it('payload를 JSON으로 직렬화한 SSE data 프레임을 만든다', () => {
    expect(formatSSEEvent({ type: 'delta', text: 'Hi' })).toBe(
      'data: {"type":"delta","text":"Hi"}\n\n',
    );
  });
});

describe('extractAnthropicErrorMessage', () => {
  it('type이 error면 에러 메시지를 반환한다', () => {
    const payload = JSON.stringify({
      type: 'error',
      error: { type: 'overloaded_error', message: '과부하 상태입니다' },
    });
    expect(extractAnthropicErrorMessage(payload)).toBe('과부하 상태입니다');
  });

  it('error 타입인데 메시지가 없으면 기본 메시지를 반환한다', () => {
    const payload = JSON.stringify({ type: 'error', error: {} });
    expect(extractAnthropicErrorMessage(payload)).toBe('Anthropic stream error');
  });

  it('에러 이벤트가 아니면 null을 반환한다', () => {
    const payload = JSON.stringify({ type: 'content_block_delta' });
    expect(extractAnthropicErrorMessage(payload)).toBeNull();
  });

  it('JSON 파싱에 실패하면 null을 반환한다', () => {
    expect(extractAnthropicErrorMessage('not json')).toBeNull();
  });
});

describe('extractGoogleErrorMessage', () => {
  it('error 필드가 있으면 에러 메시지를 반환한다', () => {
    const payload = JSON.stringify({ error: { code: 503, message: '과부하 상태입니다' } });
    expect(extractGoogleErrorMessage(payload)).toBe('과부하 상태입니다');
  });

  it('error 필드는 있는데 메시지가 없으면 기본 메시지를 반환한다', () => {
    const payload = JSON.stringify({ error: {} });
    expect(extractGoogleErrorMessage(payload)).toBe('Gemini stream error');
  });

  it('error 필드가 없으면 null을 반환한다', () => {
    const payload = JSON.stringify({ candidates: [] });
    expect(extractGoogleErrorMessage(payload)).toBeNull();
  });

  it('JSON 파싱에 실패하면 null을 반환한다', () => {
    expect(extractGoogleErrorMessage('not json')).toBeNull();
  });
});
