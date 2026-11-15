import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  // `specdiff --version` prints the published version.
  env: { SPECDIFF_VERSION: version },
  // Core ships TypeScript sources inside the workspace; bundle it so the CLI runs on plain Node.
  noExternal: [/^@specdiff\//],
  external: ['web-tree-sitter'],
  async onSuccess() {
    const app = '../../apps/app/dist';
    rmSync('dist/app', { recursive: true, force: true });
    // Never publish a CLI without its local UI (turbo.json builds the app first).
    if (!existsSync(app)) throw new Error('apps/app/dist is missing: build @specdiff/app before the CLI.');
    cpSync(app, 'dist/app', { recursive: true });
  },
});
