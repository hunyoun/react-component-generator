import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComponentCard } from './ComponentCard';
import type { GeneratedComponent } from '../types';

function makeComponent(overrides: Partial<GeneratedComponent> = {}): GeneratedComponent {
  return {
    id: '1',
    prompt: '테스트 프롬프트',
    code: 'const A = () => null;\n\nrender(<A />);',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    isStreaming: false,
    ...overrides,
  };
}

describe('ComponentCard - 탭 자동 전환', () => {
  it('스트리밍 중이면 코드 탭이 활성화된 상태로 렌더링된다', () => {
    render(
      <ComponentCard
        component={makeComponent({ isStreaming: true, code: '' })}
        onRemove={vi.fn()}
        onRegenerate={vi.fn()}
        isLoading={true}
      />,
    );

    expect(screen.getByRole('heading', { name: '코드' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '미리보기' })).not.toBeInTheDocument();
  });

  it('스트리밍이 끝나면 자동으로 미리보기 탭으로 전환된다', () => {
    const { rerender } = render(
      <ComponentCard
        component={makeComponent({ isStreaming: true, code: '' })}
        onRemove={vi.fn()}
        onRegenerate={vi.fn()}
        isLoading={true}
      />,
    );

    rerender(
      <ComponentCard
        component={makeComponent({ isStreaming: false })}
        onRemove={vi.fn()}
        onRegenerate={vi.fn()}
        isLoading={false}
      />,
    );

    expect(screen.getByRole('heading', { name: '미리보기' })).toBeInTheDocument();
  });

  it('스트리밍 중 활성 탭을 다시 클릭해도 자동 전환은 유지된다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ComponentCard
        component={makeComponent({ isStreaming: true, code: '' })}
        onRemove={vi.fn()}
        onRegenerate={vi.fn()}
        isLoading={true}
      />,
    );

    await user.click(screen.getByRole('button', { name: '코드' }));

    rerender(
      <ComponentCard
        component={makeComponent({ isStreaming: false })}
        onRemove={vi.fn()}
        onRegenerate={vi.fn()}
        isLoading={false}
      />,
    );

    expect(screen.getByRole('heading', { name: '미리보기' })).toBeInTheDocument();
  });

  it('사용자가 수동으로 다른 탭을 선택하면 스트리밍이 끝나도 자동 전환하지 않는다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ComponentCard
        component={makeComponent({ isStreaming: true, code: '' })}
        onRemove={vi.fn()}
        onRegenerate={vi.fn()}
        isLoading={true}
      />,
    );

    await user.click(screen.getByRole('button', { name: '미리보기' }));
    await user.click(screen.getByRole('button', { name: '코드' }));

    rerender(
      <ComponentCard
        component={makeComponent({ isStreaming: false })}
        onRemove={vi.fn()}
        onRegenerate={vi.fn()}
        isLoading={false}
      />,
    );

    expect(screen.getByRole('heading', { name: '코드' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '미리보기' })).not.toBeInTheDocument();
  });

  it('스트리밍 중에는 새로고침·삭제 버튼이 비활성화된다', () => {
    render(
      <ComponentCard
        component={makeComponent({ isStreaming: true, code: '' })}
        onRemove={vi.fn()}
        onRegenerate={vi.fn()}
        isLoading={true}
      />,
    );

    expect(screen.getByRole('button', { name: '미리보기 새로고침' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled();
  });
});
