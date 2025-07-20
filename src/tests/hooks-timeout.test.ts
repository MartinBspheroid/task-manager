// src/tests/hooks-timeout.test.ts
import { ProcessManager } from '../core/ProcessManager';
import { expect, test } from 'bun:test';
import { mkdirSync } from 'fs';

test('onTimeout hook is called when task times out', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hookCalled = false;
  let capturedTaskInfo: any = null;

  const info = manager.start({
    cmd: ['bash', '-c', 'echo start && sleep 10'],
    logDir: 'logs',
    idleTimeoutMs: 1000, // 1 second timeout
    hooks: {
      onTimeout: [(taskInfo) => {
        hookCalled = true;
        capturedTaskInfo = taskInfo;
      }]
    }
  });

  // Wait for timeout to trigger (1s timeout + buffer)
  await new Promise((r) => setTimeout(r, 1500));

  expect(hookCalled).toBe(true);
  expect(capturedTaskInfo).toBeTruthy();
  expect(capturedTaskInfo.status).toBe('timeout');
  expect(capturedTaskInfo.id).toBe(info.id);
});

test('onTimeout hook is not called for active processes', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let timeoutHookCalled = false;
  let successHookCalled = false;

  manager.start({
    cmd: ['echo', 'active'],
    logDir: 'logs',
    idleTimeoutMs: 500,
    hooks: {
      onTimeout: [() => { timeoutHookCalled = true; }],
      onSuccess: [() => { successHookCalled = true; }]
    }
  });

  // Process should complete before timeout
  await new Promise((r) => setTimeout(r, 300));

  expect(timeoutHookCalled).toBe(false);
  expect(successHookCalled).toBe(true);
});

test('multiple onTimeout hooks are called', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hook1Called = false;
  let hook2Called = false;

  manager.start({
    cmd: ['bash', '-c', 'echo start && sleep 10'],
    logDir: 'logs',
    idleTimeoutMs: 500,
    hooks: {
      onTimeout: [
        () => { hook1Called = true; },
        () => { hook2Called = true; }
      ]
    }
  });

  await new Promise((r) => setTimeout(r, 1000));

  expect(hook1Called).toBe(true);
  expect(hook2Called).toBe(true);
});

test('global onTimeout hooks work', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let globalHookCalled = false;

  manager.registerGlobalHooks({
    onTimeout: [() => { globalHookCalled = true; }]
  });

  manager.start({
    cmd: ['bash', '-c', 'echo start && sleep 10'],
    logDir: 'logs',
    idleTimeoutMs: 500
  });

  await new Promise((r) => setTimeout(r, 1000));

  expect(globalHookCalled).toBe(true);
});

test('timeout due to no output after initial output', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hookCalled = false;

  manager.start({
    cmd: ['bash', '-c', 'echo initial output && sleep 10'],
    logDir: 'logs',
    idleTimeoutMs: 800, // 800ms timeout
    hooks: {
      onTimeout: [() => { hookCalled = true; }]
    }
  });

  // Wait for initial output + timeout
  await new Promise((r) => setTimeout(r, 1200));

  expect(hookCalled).toBe(true);
});