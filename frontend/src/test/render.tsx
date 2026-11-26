import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// 테스트 전용 MemoryRouter: 앱의 HashRouter와 달리 URL 해시 전역 상태를 공유하지 않는다.
export function renderWithRouter(ui: ReactElement, opts: { route?: string } = {}) {
  const user = userEvent.setup();
  return { user, ...render(<MemoryRouter initialEntries={[opts.route ?? '/']}>{ui}</MemoryRouter>) };
}
