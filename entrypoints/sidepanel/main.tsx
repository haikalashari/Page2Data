import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';

const container = document.getElementById('root');
if (!container) throw new Error('Page2Data: missing #root container.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
