import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// Service workers need HTTPS (or localhost), so this only kicks in once the game has a domain.
if (import.meta.env.PROD && 'serviceWorker' in navigator && isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
