import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'node',
          include: ['packages/{core,cli,express}/**/*.test.ts', 'scripts/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'dom',
          include: [
            'packages/{ui,viewer,react,embed}/**/*.test.{ts,tsx}',
            'apps/app/src/**/*.test.{ts,tsx}',
          ],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
});
