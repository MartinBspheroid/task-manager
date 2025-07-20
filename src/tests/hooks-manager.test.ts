// src/tests/hooks-manager.test.ts
import { ProcessManager } from '../core/ProcessManager';
import { HookManager } from '../core/HookManager';
import { expect, test } from 'bun:test';
import { mkdirSync } from 'fs';
import type { TaskInfo } from '../core/types';

test('HookManager merges global and task hooks correctly', () => {
  const hookManager = new HookManager();
  
  const globalHooks = {
    onSuccess: [() => console.log('global success')],
    onFailure: [() => console.log('global failure')]
  };
  
  const taskHooks = {
    onSuccess: [() => console.log('task success')],
    onChange: [() => console.log('task change')]
  };
  
  const merged = hookManager.mergeHooks(globalHooks, taskHooks);
  
  expect(merged.onSuccess?.length).toBe(2);
  expect(merged.onFailure?.length).toBe(1);
  expect(merged.onChange?.length).toBe(1);
  expect(merged.onTerminated).toBeUndefined();
});

test('HookManager determines hook type correctly', () => {
  const hookManager = new HookManager();
  
  const successTask: TaskInfo = {
    id: 'test',
    cmd: ['echo', 'test'],
    pid: 123,
    startedAt: Date.now(),
    status: 'exited',
    exitCode: 0,
    logFile: '/tmp/test.log'
  };
  
  const failureTask: TaskInfo = {
    ...successTask,
    exitCode: 1
  };
  
  const killedTask: TaskInfo = {
    ...successTask,
    status: 'killed'
  };
  
  const timeoutTask: TaskInfo = {
    ...successTask,
    status: 'timeout'
  };
  
  expect(hookManager.determineHookType(successTask)).toBe('success');
  expect(hookManager.determineHookType(failureTask)).toBe('failure');
  expect(hookManager.determineHookType(killedTask)).toBe('terminated');
  expect(hookManager.determineHookType(timeoutTask)).toBe('timeout');
});

test('ProcessManager global hooks can be registered and cleared', () => {
  const manager = new ProcessManager();
  
  manager.registerGlobalHooks({
    onSuccess: [() => {}],
    onFailure: [() => {}]
  });
  
  let globalHooks = manager.getGlobalHooks();
  expect(globalHooks.onSuccess?.length).toBe(1);
  expect(globalHooks.onFailure?.length).toBe(1);
  
  manager.clearGlobalHooks();
  globalHooks = manager.getGlobalHooks();
  expect(globalHooks.onSuccess).toBeUndefined();
  expect(globalHooks.onFailure).toBeUndefined();
});

test('ProcessManager accumulates global hooks across registrations', () => {
  const manager = new ProcessManager();
  
  manager.registerGlobalHooks({
    onSuccess: [() => console.log('first')]
  });
  
  manager.registerGlobalHooks({
    onSuccess: [() => console.log('second')],
    onFailure: [() => console.log('failure')]
  });
  
  const globalHooks = manager.getGlobalHooks();
  expect(globalHooks.onSuccess?.length).toBe(2);
  expect(globalHooks.onFailure?.length).toBe(1);
});

test('hook execution error handling', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let goodHookCalled = false;
  
  manager.start({
    cmd: ['echo', 'error test'],
    logDir: 'logs',
    hooks: {
      onSuccess: [
        () => { throw new Error('Hook error'); }, // This should not crash the system
        () => { goodHookCalled = true; } // This should still execute
      ]
    }
  });
  
  await new Promise((r) => setTimeout(r, 500));
  
  expect(goodHookCalled).toBe(true);
});

test('hook timeout protection', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hookStarted = false;
  let hookCompleted = false;
  
  manager.start({
    cmd: ['echo', 'timeout test'],
    logDir: 'logs',
    hooks: {
      onSuccess: [
        async () => {
          hookStarted = true;
          await new Promise(r => setTimeout(r, 6000)); // 6 second delay (will timeout at 5s)
          hookCompleted = true;
        }
      ]
    }
  });
  
  // Wait a bit to ensure hook starts
  await new Promise((r) => setTimeout(r, 1000));
  expect(hookStarted).toBe(true);
  
  // Wait for hook timeout to occur (slightly more than 5 seconds)
  await new Promise((r) => setTimeout(r, 5000));
  
  // Hook should not have completed due to timeout
  expect(hookCompleted).toBe(false);
});

test('mixed hook types work together', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let successCalled = false;
  let changeCalled = false;
  
  const info = manager.start({
    cmd: ['bash', '-c', 'echo "mixed test output"; sleep 0.1'],
    logDir: 'logs',
    hooks: {
      onSuccess: [() => { successCalled = true; }],
      onChange: [() => { changeCalled = true; }]
    }
  });
  
  // Wait longer to ensure both process completion and file watching
  await new Promise((r) => setTimeout(r, 2500));
  
  expect(successCalled).toBe(true);
  expect(changeCalled).toBe(true);
  
  // Verify the task has actually completed
  const task = manager.list().find(t => t.id === info.id);
  expect(task?.status).toBe('exited');
});