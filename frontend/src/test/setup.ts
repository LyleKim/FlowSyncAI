import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import './dialogStub';

// jsdom 미구현 API 스텁
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
Element.prototype.scrollIntoView ??= () => {};

// 전체 스위트 부하에서 findBy/waitFor 기본 1초가 모자라 간헐 실패하던 것을 막는다.
configure({ asyncUtilTimeout: 3000 });

afterEach(cleanup);
