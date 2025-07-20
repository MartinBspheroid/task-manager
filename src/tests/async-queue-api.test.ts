// src/tests/async-queue-api.test.ts

import { expect, test, beforeEach, afterEach, describe } from 'bun:test';
import { mkdirSync } from 'fs';
import { ProcessManager } from '../core/ProcessManager';
import { TaskHandle } from '../core/TaskHandle';
import { cleanupTestLogs, waitForStatus } from './utils/test-helpers';

beforeEach(() => {
  cleanupTestLogs();
  mkdirSync('test-logs', { recursive: true });
});

afterEach(() => {
  cleanupTestLogs();
});

describe('Async Queue-Aware API (Task 009)', () => {
  describe('startAndWait Method', () => {
    test('startAndWait waits for immediate task completion', async () => {
      const manager = new ProcessManager();
      
      const start = Date.now();
      const result = await manager.startAndWait({
        cmd: ['echo', 'test-output'],
        logDir: 'test-logs'
      });
      const duration = Date.now() - start;
      
      expect(result.taskInfo.status).toBe('exited');
      expect(result.exitCode).toBe(0);
      expect(result.duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(1000); // Should complete quickly
    });
    
    test('startAndWait waits for queued task completion', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Start a blocker task
      const blocker = manager.start({
        cmd: ['sleep', '0.2'],
        logDir: 'test-logs'
      });
      expect(blocker.status).toBe('running');
      
      // Start queued task with startAndWait
      const start = Date.now();
      const result = await manager.startAndWait({
        cmd: ['echo', 'queued-output'],
        logDir: 'test-logs'
      });
      const duration = Date.now() - start;
      
      expect(result.taskInfo.status).toBe('exited');
      expect(result.exitCode).toBe(0);
      expect(duration).toBeGreaterThan(150); // Should wait for blocker
      
      manager.killAll();
    });
    
    test('startAndWait handles task failures', async () => {
      const manager = new ProcessManager();
      
      try {
        await manager.startAndWait({
          cmd: ['nonexistent-command-xyz'],
          logDir: 'test-logs'
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect(error).toBeDefined();
      }
    });
  });
  
  describe('waitForTask Method', () => {
    test('waitForTask waits for running task', async () => {
      const manager = new ProcessManager();
      
      const taskInfo = manager.start({
        cmd: ['sleep', '0.1'],
        logDir: 'test-logs'
      });
      
      const result = await manager.waitForTask(taskInfo.id);
      
      expect(result.taskInfo.status).toBe('exited');
      expect(result.exitCode).toBe(0);
      expect(result.duration).toBeGreaterThan(50);
    });
    
    test('waitForTask resolves immediately for completed task', async () => {
      const manager = new ProcessManager();
      
      const taskInfo = manager.start({
        cmd: ['echo', 'completed'],
        logDir: 'test-logs'
      });
      
      // Wait for it to complete
      await waitForStatus(manager, taskInfo.id, 'exited');
      
      // waitForTask should resolve immediately
      const start = Date.now();
      const result = await manager.waitForTask(taskInfo.id);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeLessThan(50);
      expect(result.taskInfo.status).toBe('exited');
    });
    
    test('waitForTask rejects for failed task', async () => {
      const manager = new ProcessManager();
      
      const taskInfo = manager.start({
        cmd: ['nonexistent-command'],
        logDir: 'test-logs'
      });
      
      try {
        await manager.waitForTask(taskInfo.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
    
    test('waitForTask throws for non-existent task', async () => {
      const manager = new ProcessManager();
      
      try {
        await manager.waitForTask('non-existent-id');
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as Error).message).toContain('Task not found');
      }
    });
  });
  
  describe('waitForAll Method', () => {
    test('waitForAll waits for multiple tasks', async () => {
      const manager = new ProcessManager();
      
      const task1 = manager.start({
        cmd: ['echo', '1'],
        logDir: 'test-logs'
      });
      const task2 = manager.start({
        cmd: ['echo', '2'],
        logDir: 'test-logs'
      });
      const task3 = manager.start({
        cmd: ['sleep', '0.1'],
        logDir: 'test-logs'
      });
      
      const results = await manager.waitForAll([task1.id, task2.id, task3.id]);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.taskInfo.status).toBe('exited');
        expect(result.exitCode).toBe(0);
      });
    });
    
    test('waitForAll with no args waits for all tasks', async () => {
      const manager = new ProcessManager();
      
      manager.start({ cmd: ['echo', 'a'], logDir: 'test-logs' });
      manager.start({ cmd: ['echo', 'b'], logDir: 'test-logs' });
      manager.start({ cmd: ['sleep', '0.1'], logDir: 'test-logs' });
      
      const results = await manager.waitForAll();
      
      expect(results.length).toBeGreaterThanOrEqual(3);
      results.forEach(result => {
        expect(['exited', 'killed', 'timeout']).toContain(result.taskInfo.status);
      });
    });
    
    test('waitForAll handles mixed success/failure', async () => {
      const manager = new ProcessManager();
      
      const success = manager.start({
        cmd: ['echo', 'success'],
        logDir: 'test-logs'
      });
      const failure = manager.start({
        cmd: ['nonexistent-command'],
        logDir: 'test-logs'
      });
      
      const results = await manager.waitForAll([success.id, failure.id]);
      
      expect(results).toHaveLength(2);
      // Both should have results, but failure will have error info
      expect(results[0]?.exitCode).toBe(0);
      expect(results[1]?.exitCode).toBe(-1);
    });
  });
  
  describe('Batch Operations', () => {
    test('startAll starts multiple tasks synchronously', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      const tasks = manager.startAll([
        { cmd: ['echo', '1'], logDir: 'test-logs' },
        { cmd: ['echo', '2'], logDir: 'test-logs' },
        { cmd: ['echo', '3'], logDir: 'test-logs' },
        { cmd: ['echo', '4'], logDir: 'test-logs' }
      ]);
      
      expect(tasks).toHaveLength(4);
      
      // First 2 should be running, rest queued
      const running = tasks.filter(t => t.status === 'running');
      const queued = tasks.filter(t => t.status === 'queued');
      
      expect(running.length).toBe(2);
      expect(queued.length).toBe(2);
      
      manager.killAll();
      manager.clearQueue();
    });
    
    test('startAllAsync starts multiple tasks asynchronously', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      const start = Date.now();
      const tasks = await manager.startAllAsync([
        { cmd: ['echo', '1'], logDir: 'test-logs' },
        { cmd: ['echo', '2'], logDir: 'test-logs' },
        { cmd: ['echo', '3'], logDir: 'test-logs' }
      ]);
      const duration = Date.now() - start;
      
      expect(tasks).toHaveLength(3);
      expect(duration).toBeLessThan(1000); // Should complete quickly
      
      // All tasks should be completed or running
      tasks.forEach(task => {
        expect(['running', 'exited']).toContain(task.status);
      });
      
      manager.killAll();
    });
  });
  
  describe('TaskHandle Class', () => {
    test('startWithHandle returns working TaskHandle', () => {
      const manager = new ProcessManager();
      
      const handle = manager.startWithHandle({
        cmd: ['echo', 'test'],
        logDir: 'test-logs'
      });
      
      expect(handle).toBeInstanceOf(TaskHandle);
      expect(handle.info.status).toBe('running');
      expect(handle.info.pid).toBeGreaterThan(0);
      
      handle.kill();
    });
    
    test('TaskHandle onCompleted waits for task', async () => {
      const manager = new ProcessManager();
      
      const handle = manager.startWithHandle({
        cmd: ['sleep', '0.1'],
        logDir: 'test-logs'
      });
      
      const result = await handle.onCompleted();
      
      expect(result.taskInfo.status).toBe('exited');
      expect(result.exitCode).toBe(0);
    });
    
    test('TaskHandle waitToStart works with queued tasks', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Block the queue
      const blocker = manager.start({
        cmd: ['sleep', '0.2'],
        logDir: 'test-logs'
      });
      
      // Create queued task with handle
      const handle = manager.startWithHandle({
        cmd: ['echo', 'queued'],
        logDir: 'test-logs'
      });
      
      expect(handle.info.status).toBe('queued');
      
      // Wait for it to start
      await handle.waitToStart();
      
      expect(handle.info.status).toBe('running');
      
      await handle.onCompleted();
      manager.killAll();
    });
    
    test('TaskHandle cancel works for queued tasks', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Block the queue
      const blocker = manager.start({
        cmd: ['sleep', '1'],
        logDir: 'test-logs'
      });
      
      // Create queued task
      const handle = manager.startWithHandle({
        cmd: ['echo', 'queued'],
        logDir: 'test-logs'
      });
      
      expect(handle.info.status).toBe('queued');
      
      // Cancel it
      handle.cancel();
      
      // Should be marked as failed
      expect(handle.info.status).toBe('start-failed');
      expect(handle.info.startError?.message).toContain('cancelled');
      
      manager.killAll();
      manager.clearQueue();
    });
    
    test('getTaskHandle returns handle for existing task', () => {
      const manager = new ProcessManager();
      
      const task = manager.start({
        cmd: ['sleep', '1'],
        logDir: 'test-logs'
      });
      
      const handle = manager.getTaskHandle(task.id);
      
      expect(handle).toBeInstanceOf(TaskHandle);
      expect(handle?.info.id).toBe(task.id);
      
      handle?.kill();
    });
    
    test('getTaskHandle returns undefined for non-existent task', () => {
      const manager = new ProcessManager();
      
      const handle = manager.getTaskHandle('non-existent');
      
      expect(handle).toBeUndefined();
    });
  });
  
  describe('Queue-Aware Patterns', () => {
    test('async methods work with queue management', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      // Fill queue
      const tasks = await manager.startAllAsync([
        { cmd: ['sleep', '0.3'], logDir: 'test-logs' },
        { cmd: ['sleep', '0.3'], logDir: 'test-logs' },
        { cmd: ['echo', 'queued1'], logDir: 'test-logs' },
        { cmd: ['echo', 'queued2'], logDir: 'test-logs' }
      ]);
      
      expect(tasks).toHaveLength(4);
      
      // Wait for queue to have space
      await manager.waitForQueueSizeLessThan(2);
      
      // Start high priority task
      const critical = await manager.startAsync({
        cmd: ['echo', 'critical'],
        logDir: 'test-logs',
        queue: { immediate: true }
      });
      
      expect(critical.status).toBe('running');
      
      // Wait for all to complete
      await manager.waitForAll();
      
      const finalTasks = manager.list();
      finalTasks.forEach(task => {
        expect(['exited', 'killed', 'timeout']).toContain(task.status);
      });
    });
    
    test('async API integrates with pause/resume', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      // Pause queue
      manager.pauseQueue();
      
      // Start tasks - should be queued
      const promise1 = manager.startAsync({
        cmd: ['echo', '1'],
        logDir: 'test-logs'
      });
      const promise2 = manager.startAsync({
        cmd: ['echo', '2'],
        logDir: 'test-logs'
      });
      
      // Should not complete while paused
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(manager.getQueueStats().pending).toBe(0);
      expect(manager.getQueueStats().size).toBe(2);
      
      // Resume and wait
      manager.resumeQueue();
      const tasks = await Promise.all([promise1, promise2]);
      
      expect(tasks).toHaveLength(2);
      tasks.forEach(task => {
        expect(['running', 'exited']).toContain(task.status);
      });
      
      await manager.waitForAll();
    });
  });
  
  describe('Error Handling', () => {
    test('async methods handle queue errors gracefully', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      try {
        await manager.startAndWait({
          cmd: ['invalid-command-xyz123'],
          logDir: 'test-logs'
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
    
    test('waitForTask handles start failures', async () => {
      const manager = new ProcessManager();
      
      const task = manager.start({
        cmd: ['nonexistent-command'],
        logDir: 'test-logs'
      });
      
      try {
        await manager.waitForTask(task.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
    
    test('TaskHandle methods handle errors properly', async () => {
      const manager = new ProcessManager();
      
      const handle = manager.startWithHandle({
        cmd: ['nonexistent-command'],
        logDir: 'test-logs'
      });
      
      try {
        await handle.onCompleted();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
  
  describe('Performance', () => {
    test('async operations have reasonable performance', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 5 }
      });
      
      const iterations = 10;
      const start = Date.now();
      
      const promises = Array.from({ length: iterations }, (_, i) =>
        manager.startAndWait({
          cmd: ['echo', i.toString()],
          logDir: 'test-logs'
        })
      );
      
      const results = await Promise.all(promises);
      const duration = Date.now() - start;
      
      expect(results).toHaveLength(iterations);
      expect(duration).toBeLessThan(2000); // Should complete in reasonable time
      
      results.forEach(result => {
        expect(result.exitCode).toBe(0);
      });
    });
    
    test('TaskHandle operations are fast', () => {
      const manager = new ProcessManager();
      
      const iterations = 100;
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();
        const handle = manager.startWithHandle({
          cmd: ['echo', i.toString()],
          logDir: 'test-logs'
        });
        const end = process.hrtime.bigint();
        
        times.push(Number(end - start) / 1_000_000);
        
        expect(handle).toBeInstanceOf(TaskHandle);
        handle.kill();
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avgTime).toBeLessThan(10); // < 10ms average
    });
  });
});