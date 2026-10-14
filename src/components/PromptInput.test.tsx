import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromptInput } from './PromptInput';
import { MAX_PROMPT_LENGTH } from '../utils/promptValidation';

describe('PromptInput', () => {
  it('프롬프트가 비어 있으면 생성 버튼이 비활성이다', () => {
    render(<PromptInput onGenerate={vi.fn()} isLoading={false} history={[]} />);
    expect(screen.getByRole('button', { name: '컴포넌트 생성' })).toBeDisabled();
  });

  it('입력하면 버튼이 활성화되고 클릭 시 입력값으로 onGenerate가 호출된다', async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(<PromptInput onGenerate={onGenerate} isLoading={false} />);

    await user.type(screen.getByRole('textbox'), '프로필 카드');
    const submit = screen.getByRole('button', { name: '컴포넌트 생성' });
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(onGenerate).toHaveBeenCalledWith('프로필 카드');
  });

  it('로딩 중에는 생성 버튼이 비활성이고 "생성 중..." 을 보여준다', () => {
    render(<PromptInput onGenerate={vi.fn()} isLoading={true} />);
    expect(screen.getByRole('button', { name: '생성 중...' })).toBeDisabled();
  });

  it(`${MAX_PROMPT_LENGTH}자를 초과하면 생성 버튼이 비활성화되고 에러 메시지를 보여준다`, async () => {
    const user = userEvent.setup();
    render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);

    await user.click(screen.getByRole('textbox'));
    await user.paste('a'.repeat(MAX_PROMPT_LENGTH + 1));

    expect(screen.getByRole('button', { name: '컴포넌트 생성' })).toBeDisabled();
    expect(screen.getByText(new RegExp(`${MAX_PROMPT_LENGTH}자를 넘을 수 없습니다`))).toBeInTheDocument();
  });

  it('히스토리가 비어 있으면 최근 프롬프트 영역을 보여주지 않는다', () => {
    render(<PromptInput onGenerate={vi.fn()} isLoading={false} history={[]} />);
    expect(screen.queryByText('최근 프롬프트')).not.toBeInTheDocument();
  });

  it('히스토리가 있으면 최근 프롬프트 칩을 보여주고, 클릭하면 입력창에 채워진다', async () => {
    const user = userEvent.setup();
    render(
      <PromptInput
        onGenerate={vi.fn()}
        isLoading={false}
        history={['이전에 쓴 프롬프트', '그 전 프롬프트']}
      />,
    );

    expect(screen.getByText('최근 프롬프트')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '이전에 쓴 프롬프트' }));

    expect(screen.getByRole('textbox')).toHaveValue('이전에 쓴 프롬프트');
  });
});
