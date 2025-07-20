// src/tests/process.test.ts
import { ProcessManager } from '../core/ProcessManager';
import { expect, test } from 'bun:test';
import { readFileSync, mkdirSync } from 'fs';

test('spawn, idle-timeout kill', async () => {
  // Ensure logs directory exists
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  const info = manager.start({
    cmd: ['bash', '-c', 'echo hi && sleep 600'],
    logDir: 'logs',
    idleTimeoutMs: 2000, // 2s for test
  });

  await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 3000)); // wait past timeout
  const list = manager.list();
  expect(list[0]?.status).toBe('timeout');

  const log = readFileSync(info.logFile, 'utf8');
  expect(log).toContain('hi');
});
