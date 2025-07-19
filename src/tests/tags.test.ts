// src/tests/tags.test.ts
import { ProcessManager } from '../core/ProcessManager';
import { expect, test } from 'bun:test';
import { mkdirSync } from 'fs';

test('tasks can be created with tags', () => {
  // Ensure logs directory exists
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  
  // Start a task with tags
  const task = manager.start({
    cmd: ['sleep', '5'],
    logDir: 'logs',
    tags: ['web-server', 'production'],
  });
  
  // Verify task has the tags
  expect(task.tags).toEqual(['web-server', 'production']);
  
  // Verify tags are preserved in task list
  const allTasks = manager.list();
  const createdTask = allTasks.find(t => t.id === task.id);
  expect(createdTask?.tags).toEqual(['web-server', 'production']);
  
  // Clean up
  manager.kill(task.id);
});

test('tasks can be created without tags', () => {
  // Ensure logs directory exists
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  
  // Start a task without tags
  const task = manager.start({
    cmd: ['echo', 'hello'],
    logDir: 'logs',
  });
  
  // Verify task has no tags
  expect(task.tags).toBeUndefined();
});

test('tasks can be created with single tag', () => {
  // Ensure logs directory exists
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  
  // Start a task with single tag
  const task = manager.start({
    cmd: ['sleep', '5'],
    logDir: 'logs',
    tags: ['database'],
  });
  
  // Verify task has the tag
  expect(task.tags).toEqual(['database']);
  
  // Clean up
  manager.kill(task.id);
});

test('tags are preserved after process exits', async () => {
  // Ensure logs directory exists
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  
  // Start a quick task with tags
  const task = manager.start({
    cmd: ['echo', 'hello'],
    logDir: 'logs',
    tags: ['test', 'quick'],
  });
  
  // Wait for process to exit
  await new Promise((r) => setTimeout(r, 100));
  
  // Verify tags are still present after exit
  const allTasks = manager.list();
  const exitedTask = allTasks.find(t => t.id === task.id);
  expect(exitedTask?.tags).toEqual(['test', 'quick']);
  expect(exitedTask?.status).toBe('exited');
});