import { describe, it, expect } from 'vitest';
import { splitSSEFrames, parseSSEEvent } from './sse';

describe('splitSSEFrames', () => {
  it('완결된 프레임들과 남은 버퍼를 분리한다', () => {
    const buffer = 'data: {"type":"delta","text":"a"}\n\ndata: {"type":"delta","text":"b"}\n\ndata: {"type":"delta"';
    expect(splitSSEFrames(buffer)).toEqual({
      frames: ['data: {"type":"delta","text":"a"}', 'data: {"type":"delta","text":"b"}'],
      rest: 'data: {"type":"delta"',
    });
  });

  it('완결된 프레임이 없으면 전체를 rest로 남긴다', () => {
    expect(splitSSEFrames('data: {"type":"delta"')).toEqual({
      frames: [],
      rest: 'data: {"type":"delta"',
    });
  });
});

describe('parseSSEEvent', () => {
  it('data 프레임을 파싱해 이벤트 객체를 반환한다', () => {
    expect(parseSSEEvent('data: {"type":"delta","text":"Hi"}')).toEqual({
      type: 'delta',
      text: 'Hi',
    });
  });

  it('data 라인이 없으면 null을 반환한다', () => {
    expect(parseSSEEvent('')).toBeNull();
  });

  it('JSON 파싱에 실패하면 null을 반환한다', () => {
    expect(parseSSEEvent('data: not json')).toBeNull();
  });

  it('type 필드가 없으면 null을 반환한다', () => {
    expect(parseSSEEvent('data: {"text":"Hi"}')).toBeNull();
  });
});
