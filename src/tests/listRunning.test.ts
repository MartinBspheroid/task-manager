// src/tests/listRunning.test.ts
import { ProcessManager } from '../core/ProcessManager';
import { expect, test } from 'bun:test';
import { mkdirSync } from 'fs';

test('listRunning() returns only running tasks', async () => {
  // Ensure logs directory exists
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  
  // Start a long-running process
  const runningTask = manager.start({
    cmd: ['sleep', '10'],
    logDir: 'logs',
  });
  
  // Start a quick process that will exit
  const quickTask = manager.start({
    cmd: ['echo', 'hello'],
    logDir: 'logs',
  });
  
  // Wait for the quick process to exit
  await new Promise((r) => setTimeout(r, 100));
  
  // Get all tasks and running tasks
  const allTasks = manager.list();
  const runningTasks = manager.listRunning();
  
  // Should have 2 total tasks but only 1 running
  expect(allTasks.length).toBe(2);
  expect(runningTasks.length).toBe(1);
  
  // The running task should be the sleep command
  expect(runningTasks[0]?.id).toBe(runningTask.id);
  expect(runningTasks[0]?.status).toBe('running');
  expect(runningTasks[0]?.cmd).toEqual(['sleep', '10']);
  
  // Clean up - kill the running task
  manager.kill(runningTask.id);
});

test('listRunning() returns empty array when no tasks are running', () => {
  const manager = new ProcessManager();
  const runningTasks = manager.listRunning();
  expect(runningTasks).toEqual([]);
});