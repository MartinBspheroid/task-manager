// src/tests/process.test.ts
import { ProcessManager } from '../core/ProcessManager';
import { expect, test, beforeEach, afterEach } from 'bun:test';
import { readFileSync, mkdirSync } from 'fs';
import { cleanupTestLogs, TEST_LOG_DIR } from './utils/test-helpers';

beforeEach(() => {
  cleanupTestLogs();
  mkdirSync(TEST_LOG_DIR, { recursive: true });
});

afterEach(() => {
  cleanupTestLogs();
});

test('spawn, idle-timeout kill', async () => {
  const manager = new ProcessManager();
  const info = manager.start({
    cmd: ['bash', '-c', 'echo hi && sleep 600'],
    logDir: TEST_LOG_DIR,
    idleTimeoutMs: 2000, // 2s for test
  });

  await new Promise((r) => setTimeout(r, 3000)); // wait past timeout
  const list = manager.list();
  expect(list[0]?.status).toBe('timeout');

  // Add a small delay to ensure log file is written and closed
  await new Promise((r) => setTimeout(r, 100));
  const log = readFileSync(info.logFile, 'utf8');
  expect(log).toContain('hi');
});
