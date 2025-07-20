// src/tests/killByTag.test.ts
import { ProcessManager } from '../core/ProcessManager';
import { expect, test } from 'bun:test';
import { mkdirSync } from 'fs';

test('killByTag() terminates only processes with matching tag', async () => {
  // Ensure logs directory exists
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  
  // Start processes with different tags
  const webTask1 = manager.start({
    cmd: ['sleep', '100'],
    logDir: 'logs',
    tags: ['web-server', 'production'],
  });
  
  const webTask2 = manager.start({
    cmd: ['sleep', '150'],
    logDir: 'logs',
    tags: ['web-server'],
  });
  
  const dbTask = manager.start({
    cmd: ['sleep', '200'],
    logDir: 'logs',
    tags: ['database', 'production'],
  });
  
  const noTagTask = manager.start({
    cmd: ['sleep', '250'],
    logDir: 'logs',
  });
  
  // Verify all tasks are running
  await new Promise((r) => setTimeout(r, 50));
  expect(manager.listRunning().length).toBe(4);
  
  // Kill all web-server tagged processes
  const killedIds = manager.killByTag('web-server');
  
  // Should kill only the 2 web-server tasks
  expect(killedIds.length).toBe(2);
  expect(killedIds).toContain(webTask1.id);
  expect(killedIds).toContain(webTask2.id);
  expect(killedIds).not.toContain(dbTask.id);
  expect(killedIds).not.toContain(noTagTask.id);
  
  // Wait for processes to be killed
  await new Promise((r) => setTimeout(r, 100));
  
  // Verify only 2 tasks are still running
  const stillRunning = manager.listRunning();
  expect(stillRunning.length).toBe(2);
  expect(stillRunning.find(t => t.id === dbTask.id)).toBeDefined();
  expect(stillRunning.find(t => t.id === noTagTask.id)).toBeDefined();
  
  // Clean up remaining tasks
  manager.killAll();
});

test('killByTag() returns empty array when no processes have the tag', async () => {
  // Ensure logs directory exists
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  
  // Start a process with different tag
  const task = manager.start({
    cmd: ['sleep', '50'],
    logDir: 'logs',
    tags: ['database'],
  });
  
  // Try to kill by non-existent tag
  const killedIds = manager.killByTag('web-server');
  expect(killedIds).toEqual([]);
  
  // Verify task is still running
  await new Promise((r) => setTimeout(r, 50));
  expect(manager.listRunning().length).toBe(1);
  
  // Clean up
  manager.kill(task.id);
});

test('killByTag() works with partial tag matches', async () => {
  // Ensure logs directory exists
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  
  // Start processes with overlapping tags
  const task1 = manager.start({
    cmd: ['sleep', '10'],
    logDir: 'logs',
    tags: ['production', 'web-server'],
  });
  
  const task2 = manager.start({
    cmd: ['sleep', '15'],
    logDir: 'logs',
    tags: ['production', 'database'],
  });
  
  const task3 = manager.start({
    cmd: ['sleep', '20'],
    logDir: 'logs',
    tags: ['development', 'web-server'],
  });
  
  // Kill all production tagged processes
  await new Promise((r) => setTimeout(r, 50));
  const killedIds = manager.killByTag('production');
  
  // Should kill tasks 1 and 2
  expect(killedIds.length).toBe(2);
  expect(killedIds).toContain(task1.id);
  expect(killedIds).toContain(task2.id);
  expect(killedIds).not.toContain(task3.id);
  
  // Wait for processes to be killed
  await new Promise((r) => setTimeout(r, 100));
  
  // Verify only development task is still running
  const stillRunning = manager.listRunning();
  expect(stillRunning.length).toBe(1);
  expect(stillRunning[0]?.id).toBe(task3.id);
  
  // Clean up
  manager.kill(task3.id);
});

test('killByTag() only affects running processes', async () => {
  // Ensure logs directory exists
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  
  // Start a quick process that will exit
  const quickTask = manager.start({
    cmd: ['echo', 'hello'],
    logDir: 'logs',
    tags: ['test'],
  });
  
  // Start a long-running process with same tag
  const longTask = manager.start({
    cmd: ['sleep', '100'],
    logDir: 'logs',
    tags: ['test'],
  });
  
  // Wait for quick process to exit
  await new Promise((r) => setTimeout(r, 150));
  
  // Kill by tag
  const killedIds = manager.killByTag('test');
  
  // Should only kill the running process
  expect(killedIds.length).toBe(1);
  expect(killedIds[0]).toBe(longTask.id);
  
  // Verify the exited process is still in the list but not killed again
  const allTasks = manager.list();
  const exitedTask = allTasks.find(t => t.id === quickTask.id);
  expect(exitedTask?.status).toBe('exited');
});