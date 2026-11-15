// Website at /, app at /app (docs/04 "Hosting and checks").
import { cpSync, existsSync, rmSync } from 'node:fs';

const web = 'apps/website/dist';
const app = 'apps/app/dist';
for (const d of [web, app])
  if (!existsSync(d)) throw new Error(`${d} missing: run pnpm build first`);
rmSync('dist', { recursive: true, force: true });
cpSync(web, 'dist', { recursive: true });
cpSync(app, 'dist/app', { recursive: true });
console.log('assembled dist/ (website at /, app at /app)');
