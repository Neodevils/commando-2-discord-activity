import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTokenHandler } from './token.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT ?? 3000);

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('No build found in dist/. Run `npm run build` before `npm start`.');
  process.exit(1);
}

const tokenHandler = createTokenHandler({
  clientId: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
});

const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  // Activities are iframed by the Discord clients; everything else stays same-origin only.
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://discord.com https://*.discord.com",
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/token', express.json({ limit: '16kb' }), tokenHandler);

app.use(
  express.static(dist, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);

// The Activity is a single page; hand any other GET back to index.html.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(dist, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Commando 2 Activity listening on http://0.0.0.0:${port}`);
});
