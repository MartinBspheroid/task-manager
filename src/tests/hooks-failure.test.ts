// src/tests/hooks-failure.test.ts
import { ProcessManager } from '../core/ProcessManager';
import { expect, test } from 'bun:test';
import { mkdirSync } from 'fs';

test('onFailure hook is called when task exits with non-zero code', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hookCalled = false;
  let capturedTaskInfo: any = null;

  const info = manager.start({
    cmd: ['bash', '-c', 'exit 1'],
    logDir: 'logs',
    hooks: {
      onFailure: [(taskInfo) => {
        hookCalled = true;
        capturedTaskInfo = taskInfo;
      }]
    }
  });

  // Wait for process to complete
  await new Promise((r) => setTimeout(r, 500));

  expect(hookCalled).toBe(true);
  expect(capturedTaskInfo).toBeTruthy();
  expect(capturedTaskInfo.status).toBe('exited');
  expect(capturedTaskInfo.exitCode).toBe(1);
  expect(capturedTaskInfo.id).toBe(info.id);
});

test('onFailure hook is not called for successful tasks', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let failureHookCalled = false;
  let successHookCalled = false;

  manager.start({
    cmd: ['echo', 'success'],
    logDir: 'logs',
    hooks: {
      onFailure: [() => { failureHookCalled = true; }],
      onSuccess: [() => { successHookCalled = true; }]
    }
  });

  await new Promise((r) => setTimeout(r, 500));

  expect(failureHookCalled).toBe(false);
  expect(successHookCalled).toBe(true);
});

test('multiple onFailure hooks are called', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hook1Called = false;
  let hook2Called = false;

  manager.start({
    cmd: ['bash', '-c', 'exit 2'],
    logDir: 'logs',
    hooks: {
      onFailure: [
        () => { hook1Called = true; },
        () => { hook2Called = true; }
      ]
    }
  });

  await new Promise((r) => setTimeout(r, 500));

  expect(hook1Called).toBe(true);
  expect(hook2Called).toBe(true);
});

test('global onFailure hooks work', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let globalHookCalled = false;

  manager.registerGlobalHooks({
    onFailure: [() => { globalHookCalled = true; }]
  });

  manager.start({
    cmd: ['bash', '-c', 'exit 3'],
    logDir: 'logs'
  });

  await new Promise((r) => setTimeout(r, 500));

  expect(globalHookCalled).toBe(true);
});