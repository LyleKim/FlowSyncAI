import { screen } from '@testing-library/react';

// ToastHost의 status·alert 컨테이너는 비어 있어도 항상 마운트돼 있다. 실제로 무언가를 알리는(글자가 든) 것만 센다.
export const liveRegions = (role: 'alert' | 'status', opts: { hidden?: boolean } = {}) =>
  screen.queryAllByRole(role, opts).filter((e) => e.textContent?.trim());
