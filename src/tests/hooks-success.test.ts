// src/tests/hooks-success.test.ts
import { ProcessManager } from '../core/ProcessManager';
import { expect, test } from 'bun:test';
import { mkdirSync } from 'fs';

test('onSuccess hook is called when task exits with code 0', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hookCalled = false;
  let capturedTaskInfo: any = null;

  const info = manager.start({
    cmd: ['echo', 'success test'],
    logDir: 'logs',
    hooks: {
      onSuccess: [(taskInfo) => {
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
  expect(capturedTaskInfo.exitCode).toBe(0);
  expect(capturedTaskInfo.id).toBe(info.id);
});

test('multiple onSuccess hooks are called', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hook1Called = false;
  let hook2Called = false;

  manager.start({
    cmd: ['echo', 'multi hook test'],
    logDir: 'logs',
    hooks: {
      onSuccess: [
        () => { hook1Called = true; },
        () => { hook2Called = true; }
      ]
    }
  });

  await new Promise((r) => setTimeout(r, 500));

  expect(hook1Called).toBe(true);
  expect(hook2Called).toBe(true);
});

test('global onSuccess hooks work', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let globalHookCalled = false;

  manager.registerGlobalHooks({
    onSuccess: [(taskInfo) => {
      globalHookCalled = true;
    }]
  });

  manager.start({
    cmd: ['echo', 'global hook test'],
    logDir: 'logs'
  });

  await new Promise((r) => setTimeout(r, 500));

  expect(globalHookCalled).toBe(true);
});

test('both global and task-specific onSuccess hooks are called', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let globalHookCalled = false;
  let taskHookCalled = false;

  manager.registerGlobalHooks({
    onSuccess: [() => { globalHookCalled = true; }]
  });

  manager.start({
    cmd: ['echo', 'combined hooks test'],
    logDir: 'logs',
    hooks: {
      onSuccess: [() => { taskHookCalled = true; }]
    }
  });

  await new Promise((r) => setTimeout(r, 500));

  expect(globalHookCalled).toBe(true);
  expect(taskHookCalled).toBe(true);
});