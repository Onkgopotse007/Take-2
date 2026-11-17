import { createRoot } from 'react-dom/client';
import { App } from './App';
import { GAME } from './lib/game';
import './styles.css';

if (GAME === 'madagascar') {
  document.title = 'Madagascar';
  document.querySelector('link[rel="manifest"]')?.setAttribute('href', '/madagascar.webmanifest');
  document.querySelector('meta[name="description"]')?.setAttribute('content', 'Madagascar, a card game of luck and nerve. Play with friends on your phone.');
}

createRoot(document.getElementById('root')!).render(<App />);

// Service workers need HTTPS (or localhost), so this only kicks in once the game has a domain.
if (import.meta.env.PROD && 'serviceWorker' in navigator && isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
