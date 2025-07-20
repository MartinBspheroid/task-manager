// src/tests/hooks-startFail.test.ts
import { ProcessManager } from '../core/ProcessManager';
import { expect, test } from 'bun:test';
import { mkdirSync } from 'fs';

test('onTaskStartFail hook is called when command does not exist', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hookCalled = false;
  let capturedTaskInfo: any = null;
  let capturedError: any = null;

  const info = manager.start({
    cmd: ['nonexistentcommand12345'],
    logDir: 'logs',
    hooks: {
      onTaskStartFail: [(taskInfo, error) => {
        hookCalled = true;
        capturedTaskInfo = taskInfo;
        capturedError = error;
      }]
    }
  });

  // Wait for startup failure
  await new Promise((r) => setTimeout(r, 500));

  expect(hookCalled).toBe(true);
  expect(capturedTaskInfo).toBeTruthy();
  expect(capturedTaskInfo.status).toBe('start-failed');
  expect(capturedTaskInfo.id).toBe(info.id);
  expect(capturedError).toBeTruthy();
  expect(capturedError).toBeInstanceOf(Error);
});

test('onTaskStartFail hook is not called for successful starts', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let startFailHookCalled = false;
  let successHookCalled = false;

  manager.start({
    cmd: ['echo', 'success'],
    logDir: 'logs',
    hooks: {
      onTaskStartFail: [() => { startFailHookCalled = true; }],
      onSuccess: [() => { successHookCalled = true; }]
    }
  });

  await new Promise((r) => setTimeout(r, 500));

  expect(startFailHookCalled).toBe(false);
  expect(successHookCalled).toBe(true);
});

test('multiple onTaskStartFail hooks are called', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hook1Called = false;
  let hook2Called = false;

  manager.start({
    cmd: ['invalidcommand999'],
    logDir: 'logs',
    hooks: {
      onTaskStartFail: [
        () => { hook1Called = true; },
        () => { hook2Called = true; }
      ]
    }
  });

  await new Promise((r) => setTimeout(r, 500));

  expect(hook1Called).toBe(true);
  expect(hook2Called).toBe(true);
});

test('global onTaskStartFail hooks work', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let globalHookCalled = false;

  manager.registerGlobalHooks({
    onTaskStartFail: [() => { globalHookCalled = true; }]
  });

  manager.start({
    cmd: ['badcommand123'],
    logDir: 'logs'
  });

  await new Promise((r) => setTimeout(r, 500));

  expect(globalHookCalled).toBe(true);
});

test('task info contains error details for start failure', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let capturedTaskInfo: any = null;

  const info = manager.start({
    cmd: ['nonexistentcmd456'],
    logDir: 'logs',
    hooks: {
      onTaskStartFail: [(taskInfo) => {
        capturedTaskInfo = taskInfo;
      }]
    }
  });

  await new Promise((r) => setTimeout(r, 500));

  expect(capturedTaskInfo).toBeTruthy();
  expect(capturedTaskInfo.status).toBe('start-failed');
  expect(capturedTaskInfo.startError).toBeTruthy();
  expect(capturedTaskInfo.exitedAt).toBeTruthy();
  expect(capturedTaskInfo.pid).toBe(-1); // Process never started
});

test('start failure task appears in task list', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();

  manager.start({
    cmd: ['failedcmd789'],
    logDir: 'logs',
    hooks: {
      onTaskStartFail: [() => {}]
    }
  });

  await new Promise((r) => setTimeout(r, 500));

  const allTasks = manager.list();
  const failedTasks = allTasks.filter(t => t.status === 'start-failed');
  
  expect(failedTasks.length).toBe(1);
  expect(failedTasks[0]?.startError).toBeTruthy();
});