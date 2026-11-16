// Copies the self-hosted Ruffle build out of node_modules into public/ruffle so
// the Activity serves its own player (no third-party CDN needed inside Discord).
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', '@ruffle-rs', 'ruffle');
const target = join(root, 'public', 'ruffle');

if (!existsSync(source)) {
  console.warn('[sync-ruffle] @ruffle-rs/ruffle is not installed yet; skipping.');
  process.exit(0);
}

const skip = new Set(['package.json', 'README.md', 'LICENSE', 'LICENSE.md', 'CHANGELOG.md']);
const isRuntimeAsset = (name) =>
  !name.startsWith('.') && !name.endsWith('.map') && !skip.has(name) && !/^LICENSE/i.test(name);

// Copy over the existing directory instead of deleting it: a running Vite dev
// server stops serving a public directory that is removed and recreated.
mkdirSync(target, { recursive: true });

let copied = 0;
for (const entry of readdirSync(source, { withFileTypes: true })) {
  if (!entry.isFile() || !isRuntimeAsset(entry.name)) continue;
  cpSync(join(source, entry.name), join(target, entry.name));
  copied += 1;
}

console.log(`[sync-ruffle] Copied ${copied} Ruffle asset(s) to public/ruffle.`);
