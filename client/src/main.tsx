import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { AuthProvider } from './auth';
import { BusinessProvider } from './business';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <BusinessProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BusinessProvider>
    </BrowserRouter>
  </StrictMode>,
);
