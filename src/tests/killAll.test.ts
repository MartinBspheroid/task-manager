// src/tests/killAll.test.ts
import { ProcessManager } from '../core/ProcessManager';
import { expect, test } from 'bun:test';
import { mkdirSync } from 'fs';

test('killAll() terminates all running processes', async () => {
  // Ensure logs directory exists
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  
  // Start multiple long-running processes
  const task1 = manager.start({
    cmd: ['sleep', '10'],
    logDir: 'logs',
  });
  
  const task2 = manager.start({
    cmd: ['sleep', '15'],
    logDir: 'logs',
  });
  
  const task3 = manager.start({
    cmd: ['sleep', '20'],
    logDir: 'logs',
  });
  
  // Verify all tasks are running
  const runningBefore = manager.listRunning();
  expect(runningBefore.length).toBe(3);
  
  // Kill all running tasks
  const killedIds = manager.killAll();
  
  // Should return the IDs of killed tasks
  expect(killedIds.length).toBe(3);
  expect(killedIds).toContain(task1.id);
  expect(killedIds).toContain(task2.id);
  expect(killedIds).toContain(task3.id);
  
  // Wait a moment for processes to be killed
  await new Promise((r) => setTimeout(r, 100));
  
  // Verify no tasks are running
  const runningAfter = manager.listRunning();
  expect(runningAfter.length).toBe(0);
  
  // Verify tasks are marked as killed
  const allTasks = manager.list();
  const killedTasks = allTasks.filter(t => t.status === 'killed');
  expect(killedTasks.length).toBe(3);
});

test('killAll() returns empty array when no tasks are running', () => {
  const manager = new ProcessManager();
  const killedIds = manager.killAll();
  expect(killedIds).toEqual([]);
});

test('killAll() only kills running tasks, not exited ones', async () => {
  // Ensure logs directory exists
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  
  // Start a quick task that will exit
  manager.start({
    cmd: ['echo', 'hello'],
    logDir: 'logs',
  });
  
  // Start a long-running task
  const longTask = manager.start({
    cmd: ['sleep', '10'],
    logDir: 'logs',
  });
  
  // Wait for the quick task to exit
  await new Promise((r) => setTimeout(r, 100));
  
  // Kill all running tasks
  const killedIds = manager.killAll();
  
  // Should only kill the running task
  expect(killedIds.length).toBe(1);
  expect(killedIds[0]).toBe(longTask.id);
});