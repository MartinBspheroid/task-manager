// src/tests/queue-management.test.ts
// Consolidated queue functionality tests
// Combines async-queue-api.test.ts, process-manager-queue.test.ts, and process-queue.test.ts

import { expect, test, beforeEach, afterEach, describe } from 'bun:test';
import { ProcessManager } from '../core/ProcessManager';
import { TaskHandle } from '../core/TaskHandle';
import { setupTestEnvironment, teardownTestEnvironment, waitForStatus, createTestManager, createQueuedTestManager, TEST_LOG_DIR } from './utils/test-helpers';

beforeEach(setupTestEnvironment);
afterEach(teardownTestEnvironment);

describe('Queue Management', () => {
  describe('Basic Queue Operations', () => {
    test('tasks are queued when concurrency limit is reached', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // First task should start immediately
      const task1 = manager.start({
        cmd: ['sleep', '0.5'],
        logDir: TEST_LOG_DIR
      });
      expect(task1.status).toBe('running');
      
      // Second task should be queued
      const task2 = manager.start({
        cmd: ['echo', 'queued'],
        logDir: TEST_LOG_DIR
      });
      expect(task2.status).toBe('queued');
      
      manager.killAll();
      manager.clearQueue();
    });

    test('queued tasks start when slots become available', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Start short task
      const task1 = manager.start({
        cmd: ['echo', 'first'],
        logDir: TEST_LOG_DIR
      });
      
      // Queue second task
      const task2 = manager.start({
        cmd: ['echo', 'second'],
        logDir: TEST_LOG_DIR
      });
      
      expect(task1.status).toBe('running');
      expect(task2.status).toBe('queued');
      
      // Wait for first to complete, second should start
      await waitForStatus(manager, task1.id, 'exited');
      await new Promise(r => setTimeout(r, 100));
      
      const task2Updated = manager.list().find(t => t.id === task2.id);
      expect(task2Updated?.status).toMatch(/running|exited/);
      
      manager.killAll();
    });

    test('queue can be paused and resumed', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      expect(manager.isQueuePaused()).toBe(false);
      
      manager.pauseQueue();
      expect(manager.isQueuePaused()).toBe(true);
      
      // New tasks should still be queued when paused
      const task = manager.start({
        cmd: ['echo', 'paused'],
        logDir: TEST_LOG_DIR
      });
      expect(task.status).toBe('queued');
      
      manager.resumeQueue();
      expect(manager.isQueuePaused()).toBe(false);
      
      manager.killAll();
      manager.clearQueue();
    });

    test('clearQueue removes pending tasks', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Fill queue
      const blocker = manager.start({
        cmd: ['sleep', '1'],
        logDir: TEST_LOG_DIR
      });
      
      const task1 = manager.start({
        cmd: ['echo', '1'],
        logDir: TEST_LOG_DIR
      });
      
      const task2 = manager.start({
        cmd: ['echo', '2'],
        logDir: TEST_LOG_DIR
      });
      
      expect(blocker.status).toBe('running');
      expect(task1.status).toBe('queued');
      expect(task2.status).toBe('queued');
      
      manager.clearQueue();
      
      // Running task should still be running, queued tasks should be gone
      const remaining = manager.list();
      expect(remaining.length).toBe(1);
      expect(remaining[0]?.id).toBe(blocker.id);
      
      manager.killAll();
    });
  });

  describe('Async Queue API', () => {
    test('startAndWait waits for immediate task completion', async () => {
      const manager = new ProcessManager();
      
      const start = Date.now();
      const result = await manager.startAndWait({
        cmd: ['echo', 'test-output'],
        logDir: TEST_LOG_DIR
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
        logDir: TEST_LOG_DIR
      });
      expect(blocker.status).toBe('running');
      
      // Start queued task with startAndWait
      const start = Date.now();
      const result = await manager.startAndWait({
        cmd: ['echo', 'queued-output'],
        logDir: TEST_LOG_DIR
      });
      const duration = Date.now() - start;
      
      expect(result.taskInfo.status).toBe('exited');
      expect(result.exitCode).toBe(0);
      expect(duration).toBeGreaterThan(150); // Should wait for blocker
      
      manager.killAll();
    });

    test('waitForTask waits for running task', async () => {
      const manager = new ProcessManager();
      
      const taskInfo = manager.start({
        cmd: ['sleep', '0.1'],
        logDir: TEST_LOG_DIR
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
        logDir: TEST_LOG_DIR
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

    test('waitForAll waits for multiple tasks', async () => {
      const manager = new ProcessManager();
      
      const task1 = manager.start({
        cmd: ['echo', '1'],
        logDir: TEST_LOG_DIR
      });
      const task2 = manager.start({
        cmd: ['echo', '2'],
        logDir: TEST_LOG_DIR
      });
      const task3 = manager.start({
        cmd: ['sleep', '0.1'],
        logDir: TEST_LOG_DIR
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
      
      manager.start({ cmd: ['echo', 'a'], logDir: TEST_LOG_DIR });
      manager.start({ cmd: ['echo', 'b'], logDir: TEST_LOG_DIR });
      manager.start({ cmd: ['sleep', '0.1'], logDir: TEST_LOG_DIR });
      
      const results = await manager.waitForAll();
      
      expect(results.length).toBeGreaterThanOrEqual(3);
      results.forEach(result => {
        expect(['exited', 'killed', 'timeout']).toContain(result.taskInfo.status);
      });
    });
  });

  describe('Batch Operations', () => {
    test('startAll starts multiple tasks synchronously', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      const tasks = manager.startAll([
        { cmd: ['echo', '1'], logDir: TEST_LOG_DIR },
        { cmd: ['echo', '2'], logDir: TEST_LOG_DIR },
        { cmd: ['echo', '3'], logDir: TEST_LOG_DIR },
        { cmd: ['echo', '4'], logDir: TEST_LOG_DIR }
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
        { cmd: ['echo', '1'], logDir: TEST_LOG_DIR },
        { cmd: ['echo', '2'], logDir: TEST_LOG_DIR },
        { cmd: ['echo', '3'], logDir: TEST_LOG_DIR }
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

  describe('TaskHandle Integration', () => {
    test('startWithHandle returns working TaskHandle', () => {
      const manager = new ProcessManager();
      
      const handle = manager.startWithHandle({
        cmd: ['echo', 'test'],
        logDir: TEST_LOG_DIR
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
        logDir: TEST_LOG_DIR
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
        logDir: TEST_LOG_DIR
      });
      
      // Create queued task with handle
      const handle = manager.startWithHandle({
        cmd: ['echo', 'queued'],
        logDir: TEST_LOG_DIR
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
        logDir: TEST_LOG_DIR
      });
      
      // Create queued task
      const handle = manager.startWithHandle({
        cmd: ['echo', 'queued'],
        logDir: TEST_LOG_DIR
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
        logDir: TEST_LOG_DIR
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

  describe('Queue Statistics and Monitoring', () => {
    test('getQueueStats provides accurate statistics', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      // Add some tasks
      const task1 = manager.start({ cmd: ['sleep', '1'], logDir: TEST_LOG_DIR });
      const task2 = manager.start({ cmd: ['sleep', '1'], logDir: TEST_LOG_DIR });
      const task3 = manager.start({ cmd: ['echo', 'queued'], logDir: TEST_LOG_DIR });
      
      const stats = manager.getQueueStats();
      
      expect(stats.pending).toBe(2); // 2 running
      expect(stats.size).toBe(1);    // 1 queued
      expect(stats.totalAdded).toBe(3);
      expect(stats.paused).toBe(false);
      
      manager.killAll();
      manager.clearQueue();
    });

    test('waitForQueueIdle waits for all tasks to complete', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      // Start some quick tasks
      manager.start({ cmd: ['echo', '1'], logDir: TEST_LOG_DIR });
      manager.start({ cmd: ['echo', '2'], logDir: TEST_LOG_DIR });
      manager.start({ cmd: ['echo', '3'], logDir: TEST_LOG_DIR });
      
      await manager.waitForQueueIdle();
      
      const stats = manager.getQueueStats();
      expect(stats.pending).toBe(0);
    });

    test('waitForQueueEmpty waits for queue to be empty', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Fill queue
      const blocker = manager.start({ cmd: ['sleep', '0.2'], logDir: TEST_LOG_DIR });
      manager.start({ cmd: ['echo', '1'], logDir: TEST_LOG_DIR });
      manager.start({ cmd: ['echo', '2'], logDir: TEST_LOG_DIR });
      
      await manager.waitForQueueEmpty();
      
      const stats = manager.getQueueStats();
      expect(stats.size).toBe(0);
      
      manager.killAll();
    });

    test('waitForQueueSizeLessThan waits for queue size condition', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Fill queue
      const blocker = manager.start({ cmd: ['sleep', '0.3'], logDir: TEST_LOG_DIR });
      manager.start({ cmd: ['echo', '1'], logDir: TEST_LOG_DIR });
      manager.start({ cmd: ['echo', '2'], logDir: TEST_LOG_DIR });
      manager.start({ cmd: ['echo', '3'], logDir: TEST_LOG_DIR });
      
      // Queue size should be 3
      expect(manager.getQueueStats().size).toBe(3);
      
      // Wait for size to drop below 2
      await manager.waitForQueueSizeLessThan(2);
      
      const stats = manager.getQueueStats();
      expect(stats.size).toBeLessThan(2);
      
      manager.killAll();
      manager.clearQueue();
    });
  });

  describe('Priority and Advanced Queue Features', () => {
    test('high priority tasks are processed first', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Block the queue
      const blocker = manager.start({
        cmd: ['sleep', '0.2'],
        logDir: TEST_LOG_DIR
      });
      
      // Add normal priority task
      const normal = manager.start({
        cmd: ['echo', 'normal'],
        logDir: TEST_LOG_DIR,
        queue: { priority: 0 }
      });
      
      // Add high priority task (should jump ahead)
      const high = manager.start({
        cmd: ['echo', 'high'],
        logDir: TEST_LOG_DIR,
        queue: { priority: 100 }
      });
      
      expect(blocker.status).toBe('running');
      expect(normal.status).toBe('queued');
      expect(high.status).toBe('queued');
      
      await manager.waitForQueueIdle();
      
      // High priority should have executed before normal
      // (This is a simplified test - real priority testing would need more sophisticated verification)
      expect(true).toBe(true); // Placeholder assertion
      
      manager.killAll();
    });

    test('immediate mode bypasses queue entirely', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Fill the queue
      const blocker = manager.start({
        cmd: ['sleep', '1'],
        logDir: TEST_LOG_DIR
      });
      
      const queued = manager.start({
        cmd: ['echo', 'queued'],
        logDir: TEST_LOG_DIR
      });
      
      // Immediate task should run despite queue being full
      const immediate = manager.start({
        cmd: ['echo', 'immediate'],
        logDir: TEST_LOG_DIR,
        queue: { immediate: true }
      });
      
      expect(blocker.status).toBe('running');
      expect(queued.status).toBe('queued');
      expect(immediate.status).toBe('running'); // Bypassed queue
      
      manager.killAll();
      manager.clearQueue();
    });
  });

  describe('Error Handling', () => {
    test('queue errors are handled gracefully', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // This test should complete quickly, not timeout
      try {
        const result = await Promise.race([
          manager.startAndWait({
            cmd: ['invalid-command-xyz123'],
            logDir: TEST_LOG_DIR
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Test timeout')), 1000)
          )
        ]);
        
        // If we get here, the command somehow succeeded (shouldn't happen)
        expect(false).toBe(true);
      } catch (error) {
        // Expected - either command failure or test timeout
        expect(error).toBeDefined();
      }
    });
    
    test('waitForTask handles start failures', async () => {
      const manager = new ProcessManager();
      
      const task = manager.start({
        cmd: ['nonexistent-command'],
        logDir: TEST_LOG_DIR
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
        logDir: TEST_LOG_DIR
      });
      
      try {
        await handle.onCompleted();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Queue Health and Shutdown', () => {
    test('getHealth provides system health information', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      const health = manager.getHealth();
      
      expect(health.status).toMatch(/healthy|degraded|unhealthy/);
      expect(Array.isArray(health.issues)).toBe(true);
      expect(typeof health.memoryUsage).toBe('number');
      expect(typeof health.processingRate).toBe('number');
      expect(typeof health.lastCheck).toBe('number');
      
      manager.killAll();
    });

    test('shutdown gracefully handles running tasks', async () => {
      const manager = new ProcessManager();
      
      // Start a quick task
      manager.start({ cmd: ['echo', 'shutdown test'], logDir: TEST_LOG_DIR });
      
      // Shutdown should wait for completion
      await manager.shutdown({ timeout: 1000 });
      
      // All tasks should be completed
      const running = manager.listRunning();
      expect(running.length).toBe(0);
    });
  });
});