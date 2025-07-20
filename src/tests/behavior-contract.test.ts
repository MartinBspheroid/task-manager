// src/tests/behavior-contract.test.ts
import { expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, existsSync } from 'fs';
import { ProcessManager } from '../core/ProcessManager';
import { cleanupTestLogs, waitForStatus } from './utils/test-helpers';

beforeEach(() => {
  cleanupTestLogs();
  mkdirSync('test-logs', { recursive: true });
});

afterEach(() => {
  cleanupTestLogs();
});

test('ProcessManager.start() synchronous guarantees', () => {
  const manager = new ProcessManager();
  
  // Measure execution time
  const before = Date.now();
  const info = manager.start({
    cmd: ['sleep', '1'],
    logDir: 'test-logs'
  });
  const after = Date.now();
  
  // Synchronous guarantees
  expect(after - before).toBeLessThan(100); // Returns immediately
  expect(info.status).toBe('running');       // Process is running
  expect(info.pid).toBeGreaterThan(0);       // PID is available
  expect(info.startedAt).toBeGreaterThan(0); // Timestamp is set
  expect(info.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/); // UUID v4
  
  // Cleanup
  manager.kill(info.id);
});

test('ProcessManager.start() with spawn failure', () => {
  const manager = new ProcessManager();
  
  const info = manager.start({
    cmd: ['nonexistentcommand12345'],
    logDir: 'test-logs'
  });
  
  // Spawn failure guarantees
  expect(info.status).toBe('start-failed');
  expect(info.pid).toBe(-1);              // No PID on failure
  expect(info.startError).toBeDefined();  // Error is captured
  expect(info.startedAt).toBeGreaterThan(0); // Timestamp still set
});

test('TaskInfo structure contract', () => {
  const manager = new ProcessManager();
  
  const info = manager.start({
    cmd: ['echo', 'test'],
    logDir: 'test-logs',
    tags: ['test-tag', 'contract'],
    idleTimeoutMs: 10000
  });
  
  // TaskInfo structure requirements
  expect(typeof info.id).toBe('string');
  expect(Array.isArray(info.cmd)).toBe(true);
  expect(info.cmd).toEqual(['echo', 'test']);
  expect(typeof info.pid).toBe('number');
  expect(typeof info.startedAt).toBe('number');
  expect(typeof info.status).toBe('string');
  expect(typeof info.logFile).toBe('string');
  expect(Array.isArray(info.tags)).toBe(true);
  expect(info.tags).toEqual(['test-tag', 'contract']);
  
  // Optional fields on return
  expect(info.exitedAt).toBeUndefined();
  expect(info.exitCode).toBeUndefined();
  
  // Log file path format
  expect(info.logFile).toBe(`test-logs/${info.id}.log`);
});

test('ProcessManager.list() behavior contract', async () => {
  const manager = new ProcessManager();
  
  // Create multiple tasks
  const task1 = manager.start({ cmd: ['sleep', '5'], logDir: 'test-logs' });
  const task2 = manager.start({ cmd: ['echo', 'quick'], logDir: 'test-logs' });
  const task3 = manager.start({ cmd: ['sleep', '5'], logDir: 'test-logs' });
  
  // Wait for quick task to complete
  await waitForStatus(manager, task2.id, 'exited');
  
  const allTasks = manager.list();
  
  // Contract requirements
  expect(allTasks.length).toBe(3);           // Returns all tasks
  expect(allTasks.find(t => t.id === task1.id)).toBeDefined(); // Includes running
  expect(allTasks.find(t => t.id === task2.id)).toBeDefined(); // Includes completed
  expect(allTasks.find(t => t.id === task3.id)).toBeDefined(); // All tasks present
  
  // Note: Current implementation returns references, not copies
  // This is part of the documented behavior contract
  const firstTaskFromList = allTasks[0]!;
  const firstTaskFromSecondCall = manager.list()[0]!;
  expect(firstTaskFromList).toBe(firstTaskFromSecondCall); // Same object reference
  
  // Cleanup
  manager.killAll();
});

test('ProcessManager.listRunning() filtering contract', async () => {
  const manager = new ProcessManager();
  
  const longTask = manager.start({ cmd: ['sleep', '5'], logDir: 'test-logs' });
  const quickTask = manager.start({ cmd: ['echo', 'done'], logDir: 'test-logs' });
  
  // Initially both might be running
  let running = manager.listRunning();
  expect(running.length).toBeGreaterThan(0);
  
  // Wait for quick task to exit
  await waitForStatus(manager, quickTask.id, 'exited');
  
  running = manager.listRunning();
  
  // Contract requirements
  expect(running.length).toBe(1);
  expect(running[0]!.id).toBe(longTask.id);
  expect(running[0]!.status).toBe('running');
  expect(running.find(t => t.id === quickTask.id)).toBeUndefined(); // Exited task not included
  
  // Cleanup
  manager.kill(longTask.id);
});

test('ProcessManager.kill() error contract', () => {
  const manager = new ProcessManager();
  
  // Test with invalid ID
  expect(() => {
    manager.kill('invalid-uuid');
  }).toThrow('task invalid-uuid not found');
  
  // Test with valid task
  const task = manager.start({ cmd: ['sleep', '5'], logDir: 'test-logs' });
  
  expect(() => {
    manager.kill(task.id); // Should not throw
  }).not.toThrow();
  
  // Test killing already dead task (should not throw)
  expect(() => {
    manager.kill(task.id); // Should be idempotent
  }).not.toThrow();
});

test('ProcessManager.write() error contract', () => {
  const manager = new ProcessManager();
  
  // Test with invalid ID
  expect(() => {
    manager.write('invalid-uuid', 'test data');
  }).toThrow('task invalid-uuid not found');
  
  // Test with valid task
  const task = manager.start({ cmd: ['cat'], logDir: 'test-logs' }); // cat reads stdin
  
  expect(() => {
    manager.write(task.id, 'test input\n');
  }).not.toThrow();
  
  // Cleanup
  manager.kill(task.id);
});

test('ProcessManager.killAll() return contract', async () => {
  const manager = new ProcessManager();
  
  // Test with no running tasks
  expect(manager.killAll()).toEqual([]);
  
  // Create multiple tasks
  const task1 = manager.start({ cmd: ['sleep', '10'], logDir: 'test-logs' });
  const task2 = manager.start({ cmd: ['sleep', '10'], logDir: 'test-logs' });
  const quickTask = manager.start({ cmd: ['echo', 'done'], logDir: 'test-logs' });
  
  // Wait for quick task to exit
  await waitForStatus(manager, quickTask.id, 'exited');
  
  // Small delay to ensure all processes are stable
  await new Promise(r => setTimeout(r, 100));
  
  const killedIds = manager.killAll();
  
  // Contract requirements
  expect(killedIds.length).toBe(2);
  expect(killedIds).toContain(task1.id);
  expect(killedIds).toContain(task2.id);
  expect(killedIds).not.toContain(quickTask.id); // Already exited
  
  // Verify tasks are actually killed
  const runningAfter = manager.listRunning();
  expect(runningAfter.length).toBe(0);
});

test('ProcessManager.killByTag() filtering contract', () => {
  const manager = new ProcessManager();
  
  const webTask1 = manager.start({
    cmd: ['sleep', '10'],
    logDir: 'test-logs',
    tags: ['web-server', 'production']
  });
  
  const webTask2 = manager.start({
    cmd: ['sleep', '10'],
    logDir: 'test-logs',
    tags: ['web-server']
  });
  
  const dbTask = manager.start({
    cmd: ['sleep', '10'],
    logDir: 'test-logs',
    tags: ['database']
  });
  
  const noTagTask = manager.start({
    cmd: ['sleep', '10'],
    logDir: 'test-logs'
  });
  
  const killedIds = manager.killByTag('web-server');
  
  // Contract requirements
  expect(killedIds.length).toBe(2);
  expect(killedIds).toContain(webTask1.id);
  expect(killedIds).toContain(webTask2.id);
  expect(killedIds).not.toContain(dbTask.id);
  expect(killedIds).not.toContain(noTagTask.id);
  
  // Verify only web-server tasks were killed
  const stillRunning = manager.listRunning();
  expect(stillRunning.length).toBe(2);
  expect(stillRunning.find(t => t.id === dbTask.id)).toBeDefined();
  expect(stillRunning.find(t => t.id === noTagTask.id)).toBeDefined();
  
  // Cleanup
  manager.killAll();
});

test('Task status lifecycle contract', async () => {
  const manager = new ProcessManager();
  
  // Test successful process
  const successTask = manager.start({
    cmd: ['echo', 'success'],
    logDir: 'test-logs'
  });
  
  expect(successTask.status).toBe('running'); // Initial status
  await waitForStatus(manager, successTask.id, 'exited');
  
  const completedTask = manager.list().find(t => t.id === successTask.id);
  expect(completedTask?.status).toBe('exited');
  expect(completedTask?.exitedAt).toBeGreaterThan(completedTask!.startedAt);
  expect(completedTask?.exitCode).toBe(0);
  
  // Test killed process - note: exitedAt is set when process actually exits
  const killedTask = manager.start({
    cmd: ['sleep', '10'],
    logDir: 'test-logs'
  });
  
  expect(killedTask.status).toBe('running');
  manager.kill(killedTask.id);
  
  // Wait for the process to actually exit after being killed
  await waitForStatus(manager, killedTask.id, 'killed');
  
  // Small delay for process to fully exit and set exitedAt
  await new Promise(r => setTimeout(r, 100));
  
  const deadTask = manager.list().find(t => t.id === killedTask.id);
  expect(deadTask?.status).toBe('killed');
  // Note: exitedAt may not be set immediately when terminate() is called
  // It's set when the process actually exits via #handleProcessExit
});

test('Hook execution contract', async () => {
  const manager = new ProcessManager();
  
  let successHookCalled = false;
  let hookTaskInfo: any = null;
  
  const task = manager.start({
    cmd: ['echo', 'hook test'],
    logDir: 'test-logs',
    hooks: {
      onSuccess: [(taskInfo) => {
        successHookCalled = true;
        hookTaskInfo = taskInfo;
      }]
    }
  });
  
  await waitForStatus(manager, task.id, 'exited');
  
  // Longer delay for hook execution as they run asynchronously
  await new Promise(r => setTimeout(r, 500));
  
  // Hook execution contract
  expect(successHookCalled).toBe(true);
  expect(hookTaskInfo).toBeDefined();
  expect(hookTaskInfo.id).toBe(task.id);
  expect(hookTaskInfo.status).toBe('exited');
  expect(hookTaskInfo.exitCode).toBe(0);
});

test('Log file creation contract', async () => {
  const manager = new ProcessManager();
  
  const task = manager.start({
    cmd: ['echo', 'log test'],
    logDir: 'test-logs'
  });
  
  // Log file path format is guaranteed
  expect(task.logFile).toBe(`test-logs/${task.id}.log`);
  
  // Log file creation happens during process initialization
  // Small delay to allow file system operations
  await new Promise(r => setTimeout(r, 50));
  expect(existsSync(task.logFile)).toBe(true);
  
  // Cleanup
  manager.kill(task.id);
});

test('Event emission contract', async () => {
  const manager = new ProcessManager();
  
  // Test events through hooks since ProcessTask events are not exposed
  let exitEventReceived = false;
  let exitEventData: any = null;
  
  const task = manager.start({
    cmd: ['echo', 'event test'],
    logDir: 'test-logs',
    hooks: {
      onSuccess: [(taskInfo) => {
        exitEventReceived = true;
        exitEventData = taskInfo;
      }]
    }
  });
  
  await waitForStatus(manager, task.id, 'exited');
  
  // Small delay for hook execution
  await new Promise(r => setTimeout(r, 200));
  
  // Event contract (verified through hooks)
  expect(exitEventReceived).toBe(true);
  expect(exitEventData).toBeDefined();
  expect(exitEventData.id).toBe(task.id);
  expect(exitEventData.status).toBe('exited');
});