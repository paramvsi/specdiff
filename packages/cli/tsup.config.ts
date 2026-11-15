import { cpSync, existsSync, rmSync } from 'node:fs';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  // Core ships TypeScript sources inside the workspace; bundle it so the CLI runs on plain Node.
  noExternal: [/^@specdiff\//],
  external: ['web-tree-sitter'],
  async onSuccess() {
    const app = '../../apps/app/dist';
    rmSync('dist/app', { recursive: true, force: true });
    if (existsSync(app)) cpSync(app, 'dist/app', { recursive: true });
    else console.warn('apps/app/dist is missing: build the app first for the local UI.');
  },
});
