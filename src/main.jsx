import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);
import('@capacitor/splash-screen').then(({ SplashScreen }) => setTimeout(() => SplashScreen.hide().catch(() => {}), 300)).catch(() => {});
