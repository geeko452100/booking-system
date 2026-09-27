// Prepares `wrangler dev`: local secrets file, and an assets folder (the Vite dev server serves the UI in development).
import fs from 'node:fs';

if (!fs.existsSync('.dev.vars')) fs.copyFileSync('.dev.vars.example', '.dev.vars');
fs.mkdirSync('../client/dist', { recursive: true });
if (!fs.existsSync('../client/dist/index.html')) {
  fs.writeFileSync('../client/dist/index.html', '<!doctype html><p>Run the Vite dev server (npm run dev) and open http://localhost:5173.</p>');
}
