// src/tests/hooks-terminated.test.ts
import { ProcessManager } from '../core/ProcessManager';
import { expect, test } from 'bun:test';
import { mkdirSync } from 'fs';

test('onTerminated hook is called when task is manually killed', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hookCalled = false;
  let capturedTaskInfo: any = null;

  const info = manager.start({
    cmd: ['sleep', '10'],
    logDir: 'logs',
    hooks: {
      onTerminated: [(taskInfo) => {
        hookCalled = true;
        capturedTaskInfo = taskInfo;
      }]
    }
  });

  // Wait a bit then kill the process
  await new Promise((r) => setTimeout(r, 100));
  manager.kill(info.id);
  
  // Wait for termination to complete
  await new Promise((r) => setTimeout(r, 200));

  expect(hookCalled).toBe(true);
  expect(capturedTaskInfo).toBeTruthy();
  expect(capturedTaskInfo.status).toBe('killed');
  expect(capturedTaskInfo.id).toBe(info.id);
});

test('onTerminated hook is not called for natural exit', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let terminatedHookCalled = false;
  let successHookCalled = false;

  manager.start({
    cmd: ['echo', 'test'],
    logDir: 'logs',
    hooks: {
      onTerminated: [() => { terminatedHookCalled = true; }],
      onSuccess: [() => { successHookCalled = true; }]
    }
  });

  await new Promise((r) => setTimeout(r, 500));

  expect(terminatedHookCalled).toBe(false);
  expect(successHookCalled).toBe(true);
});

test('multiple onTerminated hooks are called', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hook1Called = false;
  let hook2Called = false;

  const info = manager.start({
    cmd: ['sleep', '10'],
    logDir: 'logs',
    hooks: {
      onTerminated: [
        () => { hook1Called = true; },
        () => { hook2Called = true; }
      ]
    }
  });

  await new Promise((r) => setTimeout(r, 100));
  manager.kill(info.id);
  await new Promise((r) => setTimeout(r, 200));

  expect(hook1Called).toBe(true);
  expect(hook2Called).toBe(true);
});

test('killAll triggers onTerminated hooks for all processes', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hook1Called = false;
  let hook2Called = false;

  manager.start({
    cmd: ['sleep', '10'],
    logDir: 'logs',
    hooks: {
      onTerminated: [() => { hook1Called = true; }]
    }
  });

  manager.start({
    cmd: ['sleep', '10'],
    logDir: 'logs',
    hooks: {
      onTerminated: [() => { hook2Called = true; }]
    }
  });

  await new Promise((r) => setTimeout(r, 100));
  manager.killAll();
  await new Promise((r) => setTimeout(r, 200));

  expect(hook1Called).toBe(true);
  expect(hook2Called).toBe(true);
});