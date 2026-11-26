import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useMyLogin } from '../../hooks/useMyLogin';
import FirstRunFlow from './FirstRunFlow';

// 활성 여부는 마운트 시 한 번만 정한다: 흐름 도중 로그인이 저장돼도 children으로 튕기지 않는다.
export default function FirstRunGate({ children }: { children: ReactNode }) {
  const { login } = useMyLogin();
  const [active, setActive] = useState(() => login === null);
  const finished = useRef(false);

  useLayoutEffect(() => {
    // 흐름을 마치면 누른 버튼이 사라지므로 새 화면 제목으로 포커스를 옮긴다.
    if (finished.current) document.querySelector<HTMLElement>('h1')?.focus();
  }, [active]);

  if (!active) return <>{children}</>;
  return <FirstRunFlow onFinished={() => { finished.current = true; setActive(false); }} />;
}
