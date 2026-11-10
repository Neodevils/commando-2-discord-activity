import { defineConfig, loadEnv } from 'vite';
import { createTokenHandler } from './server/token.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const tokenHandler = createTokenHandler({
    clientId: env.DISCORD_CLIENT_ID,
    clientSecret: env.DISCORD_CLIENT_SECRET,
  });

  return {
    // Relative asset URLs so the same build works at a domain root and under a
    // GitHub Pages project path (https://user.github.io/repo/).
    base: './',
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
    },
    build: {
      // Ruffle ships ~28 MB of WASM; keep it as a separate cached download rather
      // than letting the bundler inline it.
      assetsInlineLimit: 0,
    },
    plugins: [
      {
        name: 'discord-token-endpoint',
        configureServer(server) {
          server.middlewares.use('/api/token', (req, res) => {
            tokenHandler(req, res).catch((error: unknown) => {
              console.error('[token] Unexpected failure.', error);
              if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'internal_error' }));
              }
            });
          });
        },
      },
    ],
  };
});
