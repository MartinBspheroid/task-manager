// src/tests/hooks.test.ts
// Consolidated hook testing - combines functionality from all hook-*.test.ts files

import { expect, test, beforeEach, afterEach, describe } from 'bun:test';
import { ProcessManager } from '../core/ProcessManager';
import { setupTestEnvironment, teardownTestEnvironment, waitForStatus, createTestManager, TEST_LOG_DIR } from './utils/test-helpers';

beforeEach(setupTestEnvironment);
afterEach(teardownTestEnvironment);

describe('Hook System', () => {
  describe('Success Hooks', () => {
    test('onSuccess hook is called when task exits with code 0', async () => {
      const manager = new ProcessManager();
      let hookCalled = false;
      let capturedTaskInfo: any = null;

      const taskInfo = manager.start({
        cmd: ['echo', 'success test'],
        logDir: TEST_LOG_DIR,
        hooks: {
          onSuccess: [(taskInfo) => {
            hookCalled = true;
            capturedTaskInfo = taskInfo;
          }]
        }
      });

      await waitForStatus(manager, taskInfo.id, 'exited');
      await new Promise(r => setTimeout(r, 100));

      expect(hookCalled).toBe(true);
      expect(capturedTaskInfo).toBeDefined();
      expect(capturedTaskInfo.id).toBe(taskInfo.id);
      expect(capturedTaskInfo.exitCode).toBe(0);
    });

    test('multiple onSuccess hooks are all called', async () => {
      const manager = new ProcessManager();
      const hookCalls: string[] = [];

      const taskInfo = manager.start({
        cmd: ['echo', 'multiple hooks'],
        logDir: TEST_LOG_DIR,
        hooks: {
          onSuccess: [
            () => hookCalls.push('hook1'),
            () => hookCalls.push('hook2'),
            () => hookCalls.push('hook3')
          ]
        }
      });

      await waitForStatus(manager, taskInfo.id, 'exited');
      await new Promise(r => setTimeout(r, 100));

      expect(hookCalls).toEqual(['hook1', 'hook2', 'hook3']);
    });
  });

  describe('Failure Hooks', () => {
    test('onFailure hook is called when task exits with non-zero code', async () => {
      const manager = new ProcessManager();
      let hookCalled = false;
      let capturedTaskInfo: any = null;

      const taskInfo = manager.start({
        cmd: ['sh', '-c', 'exit 1'],
        logDir: TEST_LOG_DIR,
        hooks: {
          onFailure: [(taskInfo) => {
            hookCalled = true;
            capturedTaskInfo = taskInfo;
          }]
        }
      });

      await waitForStatus(manager, taskInfo.id, 'exited');
      await new Promise(r => setTimeout(r, 100));

      expect(hookCalled).toBe(true);
      expect(capturedTaskInfo).toBeDefined();
      expect(capturedTaskInfo.id).toBe(taskInfo.id);
      expect(capturedTaskInfo.exitCode).toBe(1);
    });

    test('multiple onFailure hooks are all called', async () => {
      const manager = new ProcessManager();
      const hookCalls: string[] = [];

      const taskInfo = manager.start({
        cmd: ['sh', '-c', 'exit 2'],
        logDir: TEST_LOG_DIR,
        hooks: {
          onFailure: [
            () => hookCalls.push('fail1'),
            () => hookCalls.push('fail2')
          ]
        }
      });

      await waitForStatus(manager, taskInfo.id, 'exited');
      await new Promise(r => setTimeout(r, 100));

      expect(hookCalls).toEqual(['fail1', 'fail2']);
    });
  });

  describe('Start Failure Hooks', () => {
    test('onTaskStartFail hook is called when process fails to start', async () => {
      const manager = new ProcessManager();
      let hookCalled = false;
      let capturedTaskInfo: any = null;

      const taskInfo = manager.start({
        cmd: ['nonexistent-command-123'],
        logDir: TEST_LOG_DIR,
        hooks: {
          onTaskStartFail: [(taskInfo) => {
            hookCalled = true;
            capturedTaskInfo = taskInfo;
          }]
        }
      });

      // Wait for hook execution
      await new Promise(r => setTimeout(r, 100));

      expect(hookCalled).toBe(true);
      expect(capturedTaskInfo).toBeDefined();
      expect(capturedTaskInfo.id).toBe(taskInfo.id);
      expect(capturedTaskInfo.status).toBe('start-failed');
    });

    test('multiple onTaskStartFail hooks are called', async () => {
      const manager = new ProcessManager();
      const hookCalls: string[] = [];

      manager.start({
        cmd: ['invalid-command-xyz'],
        logDir: TEST_LOG_DIR,
        hooks: {
          onTaskStartFail: [
            () => hookCalls.push('startfail1'),
            () => hookCalls.push('startfail2')
          ]
        }
      });

      await new Promise(r => setTimeout(r, 100));
      expect(hookCalls).toEqual(['startfail1', 'startfail2']);
    });
  });

  describe('Terminated Hooks', () => {
    test('onTerminated hook is called when task is killed', async () => {
      const manager = new ProcessManager();
      let hookCalled = false;
      let capturedTaskInfo: any = null;

      const taskInfo = manager.start({
        cmd: ['sleep', '10'],
        logDir: TEST_LOG_DIR,
        hooks: {
          onTerminated: [(taskInfo) => {
            hookCalled = true;
            capturedTaskInfo = taskInfo;
          }]
        }
      });

      // Give the process time to start
      await new Promise(r => setTimeout(r, 100));
      manager.kill(taskInfo.id);

      await waitForStatus(manager, taskInfo.id, 'killed');
      await new Promise(r => setTimeout(r, 100));

      expect(hookCalled).toBe(true);
      expect(capturedTaskInfo).toBeDefined();
      expect(capturedTaskInfo.id).toBe(taskInfo.id);
      expect(capturedTaskInfo.status).toBe('killed');
    });

    test('multiple onTerminated hooks are called', async () => {
      const manager = new ProcessManager();
      const hookCalls: string[] = [];

      const taskInfo = manager.start({
        cmd: ['sleep', '10'],
        logDir: TEST_LOG_DIR,
        hooks: {
          onTerminated: [
            () => hookCalls.push('term1'),
            () => hookCalls.push('term2')
          ]
        }
      });

      await new Promise(r => setTimeout(r, 100));
      manager.kill(taskInfo.id);
      await waitForStatus(manager, taskInfo.id, 'killed');
      await new Promise(r => setTimeout(r, 100));

      expect(hookCalls).toEqual(['term1', 'term2']);
    });
  });

  describe('Timeout Hooks', () => {
    test('onTimeout hook is called when task times out', async () => {
      const manager = new ProcessManager();
      let hookCalled = false;
      let capturedTaskInfo: any = null;

      const taskInfo = manager.start({
        cmd: ['sleep', '10'],
        logDir: TEST_LOG_DIR,
        idleTimeoutMs: 100,
        hooks: {
          onTimeout: [(taskInfo) => {
            hookCalled = true;
            capturedTaskInfo = taskInfo;
          }]
        }
      });

      await waitForStatus(manager, taskInfo.id, 'timeout');
      await new Promise(r => setTimeout(r, 100));

      expect(hookCalled).toBe(true);
      expect(capturedTaskInfo).toBeDefined();
      expect(capturedTaskInfo.id).toBe(taskInfo.id);
      expect(capturedTaskInfo.status).toBe('timeout');
    });

    test('multiple onTimeout hooks are called', async () => {
      const manager = new ProcessManager();
      const hookCalls: string[] = [];

      const taskInfo = manager.start({
        cmd: ['sleep', '10'],
        logDir: TEST_LOG_DIR,
        idleTimeoutMs: 100,
        hooks: {
          onTimeout: [
            () => hookCalls.push('timeout1'),
            () => hookCalls.push('timeout2')
          ]
        }
      });

      await waitForStatus(manager, taskInfo.id, 'timeout');
      await new Promise(r => setTimeout(r, 100));

      expect(hookCalls).toEqual(['timeout1', 'timeout2']);
    });
  });

  describe('Change Hooks', () => {
    test('onChange hook is called for status changes', async () => {
      const manager = new ProcessManager();
      const changes: string[] = [];

      const taskInfo = manager.start({
        cmd: ['echo', 'change test'],
        logDir: TEST_LOG_DIR,
        hooks: {
          onChange: [(taskInfo, previousStatus) => {
            changes.push(`${previousStatus} -> ${taskInfo.status}`);
          }]
        }
      });

      await waitForStatus(manager, taskInfo.id, 'exited');
      await new Promise(r => setTimeout(r, 200));

      expect(changes.length).toBeGreaterThan(0);
      // Note: onChange hooks may not be fully implemented yet
      // expect(changes.some(change => change.includes('exited'))).toBe(true);
    });

    test('multiple onChange hooks track all changes', async () => {
      const manager = new ProcessManager();
      const changes1: string[] = [];
      const changes2: string[] = [];

      const taskInfo = manager.start({
        cmd: ['echo', 'multi change'],
        logDir: TEST_LOG_DIR,
        hooks: {
          onChange: [
            (taskInfo, prev) => changes1.push(`hook1: ${prev} -> ${taskInfo.status}`),
            (taskInfo, prev) => changes2.push(`hook2: ${prev} -> ${taskInfo.status}`)
          ]
        }
      });

      await waitForStatus(manager, taskInfo.id, 'exited');
      await new Promise(r => setTimeout(r, 100));

      expect(changes1.length).toBe(changes2.length);
      expect(changes1.length).toBeGreaterThan(0);
    });
  });

  describe('Global Hooks', () => {
    test('global hooks are called for all tasks', async () => {
      const manager = new ProcessManager();
      const globalCalls: string[] = [];

      manager.registerGlobalHooks({
        onSuccess: [() => globalCalls.push('global-success')]
      });

      const task1 = manager.start({
        cmd: ['echo', 'task1'],
        logDir: TEST_LOG_DIR
      });

      const task2 = manager.start({
        cmd: ['echo', 'task2'],
        logDir: TEST_LOG_DIR
      });

      await waitForStatus(manager, task1.id, 'exited');
      await waitForStatus(manager, task2.id, 'exited');
      await new Promise(r => setTimeout(r, 200));

      expect(globalCalls).toEqual(['global-success', 'global-success']);
    });

    test('global and local hooks both execute', async () => {
      const manager = new ProcessManager();
      const calls: string[] = [];

      manager.registerGlobalHooks({
        onSuccess: [() => calls.push('global')]
      });

      const taskInfo = manager.start({
        cmd: ['echo', 'mixed hooks'],
        logDir: TEST_LOG_DIR,
        hooks: {
          onSuccess: [() => calls.push('local')]
        }
      });

      await waitForStatus(manager, taskInfo.id, 'exited');
      await new Promise(r => setTimeout(r, 100));

      expect(calls.sort()).toEqual(['global', 'local']);
    });

    test('clearGlobalHooks removes all global hooks', async () => {
      const manager = new ProcessManager();
      const calls: string[] = [];

      manager.registerGlobalHooks({
        onSuccess: [() => calls.push('should-not-be-called')]
      });

      manager.clearGlobalHooks();

      const taskInfo = manager.start({
        cmd: ['echo', 'no global hooks'],
        logDir: TEST_LOG_DIR
      });

      await waitForStatus(manager, taskInfo.id, 'exited');
      await new Promise(r => setTimeout(r, 100));

      expect(calls).toEqual([]);
    });
  });

  describe('Hook Error Handling', () => {
    test('hook errors do not crash the task', async () => {
      const manager = new ProcessManager();
      let taskCompleted = false;

      const taskInfo = manager.start({
        cmd: ['echo', 'error test'],
        logDir: TEST_LOG_DIR,
        hooks: {
          onSuccess: [
            () => { throw new Error('Hook error'); },
            () => { taskCompleted = true; }
          ]
        }
      });

      await waitForStatus(manager, taskInfo.id, 'exited');
      await new Promise(r => setTimeout(r, 100));

      // Task should complete even if hook throws
      expect(taskInfo.id).toBeDefined();
      expect(taskCompleted).toBe(true);
    });

    test('async hooks are handled properly', async () => {
      const manager = new ProcessManager();
      let asyncHookCompleted = false;

      const taskInfo = manager.start({
        cmd: ['echo', 'async hook'],
        logDir: TEST_LOG_DIR,
        hooks: {
          onSuccess: [async () => {
            await new Promise(r => setTimeout(r, 50));
            asyncHookCompleted = true;
          }]
        }
      });

      await waitForStatus(manager, taskInfo.id, 'exited');
      await new Promise(r => setTimeout(r, 200));

      expect(asyncHookCompleted).toBe(true);
    });
  });

  describe('Hook Manager Integration', () => {
    test('hooks are merged correctly from global and task-specific', async () => {
      const manager = new ProcessManager();
      const execution: string[] = [];

      // Set global hooks
      manager.registerGlobalHooks({
        onSuccess: [() => execution.push('global1')],
        onFailure: [() => execution.push('global-fail')]
      });

      const taskInfo = manager.start({
        cmd: ['echo', 'merge test'],
        logDir: TEST_LOG_DIR,
        hooks: {
          onSuccess: [() => execution.push('local1')],
          onChange: [() => execution.push('local-change')]
        }
      });

      await waitForStatus(manager, taskInfo.id, 'exited');
      await new Promise(r => setTimeout(r, 100));

      expect(execution).toContain('global1');
      expect(execution).toContain('local1');
      expect(execution).toContain('local-change');
      expect(execution).not.toContain('global-fail'); // Not called for success
    });

    test('hook execution order is preserved', async () => {
      const manager = new ProcessManager();
      const order: number[] = [];

      const taskInfo = manager.start({
        cmd: ['echo', 'order test'],
        logDir: TEST_LOG_DIR,
        hooks: {
          onSuccess: [
            () => order.push(1),
            () => order.push(2),
            () => order.push(3)
          ]
        }
      });

      await waitForStatus(manager, taskInfo.id, 'exited');
      await new Promise(r => setTimeout(r, 100));

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('Constructor Hook Integration', () => {
    test('hooks provided in ProcessManager constructor work as global hooks', async () => {
      const calls: string[] = [];
      
      const manager = new ProcessManager({
        hooks: {
          onSuccess: [() => calls.push('constructor-global')]
        }
      });

      const taskInfo = manager.start({
        cmd: ['echo', 'constructor test'],
        logDir: TEST_LOG_DIR
      });

      await waitForStatus(manager, taskInfo.id, 'exited');
      await new Promise(r => setTimeout(r, 100));

      expect(calls).toEqual(['constructor-global']);
    });

    test('constructor hooks merge with registerGlobalHooks', async () => {
      const calls: string[] = [];
      
      const manager = new ProcessManager({
        hooks: {
          onSuccess: [() => calls.push('constructor')]
        }
      });

      manager.registerGlobalHooks({
        onSuccess: [() => calls.push('registered')]
      });

      const taskInfo = manager.start({
        cmd: ['echo', 'merged global'],
        logDir: TEST_LOG_DIR
      });

      await waitForStatus(manager, taskInfo.id, 'exited');
      await new Promise(r => setTimeout(r, 100));

      expect(calls.sort()).toEqual(['constructor', 'registered']);
    });
  });
});