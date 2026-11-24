import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {HashRouter} from 'react-router';
import App from './App.tsx';
import './index.css';

// 라우터 생성은 이 한 곳뿐(결정 27). BrowserRouter로 바꿀 때 이 줄만 바뀐다.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
