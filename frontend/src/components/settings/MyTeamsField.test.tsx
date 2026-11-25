import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getMyTeams, setMyTeams } from '../../lib/storage';
import MyTeamsField from './MyTeamsField';

beforeEach(() => localStorage.clear());
const setup = () => {
  const user = userEvent.setup();
  render(<MyTeamsField />);
  return { user, input: screen.getByLabelText('내 팀 (선택)') };
};
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: '저장' }));

describe('MyTeamsField', () => {
  it('정규화해 저장하고 상태 문구', async () => {
    const { user, input } = setup();
    await user.type(input, 'acme/Core, acme/api');
    await save(user);
    expect(getMyTeams()).toEqual(['acme/core', 'acme/api']);
    expect(screen.getByRole('status')).toHaveTextContent('내 팀 2개를 저장했어요');
  });

  it('무효 토큰은 인라인 오류, 저장 안 됨, 입력 유지', async () => {
    const { user, input } = setup();
    await user.type(input, 'acme');
    await save(user);
    expect(screen.getByText('‘acme’은 org/팀이름 형식이 아니에요')).toBeInTheDocument();
    expect(getMyTeams()).toEqual([]);
    expect(input).toHaveValue('acme');
  });

  it('빈 입력 저장 → 비움', async () => {
    setMyTeams(['acme/core']);
    const { user, input } = setup();
    await user.clear(input);
    await save(user);
    expect(getMyTeams()).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent('내 팀을 비웠어요');
  });

  it('11개는 거절', async () => {
    const { user, input } = setup();
    await user.type(input, Array.from({ length: 11 }, (_, i) => `acme/t${i}`).join(','));
    await save(user);
    expect(screen.getByText('팀은 10개까지 넣을 수 있어요')).toBeInTheDocument();
    expect(getMyTeams()).toEqual([]);
  });
});
