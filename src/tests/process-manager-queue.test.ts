// src/tests/process-manager-queue.test.ts

import { expect, test, beforeEach, afterEach, describe } from 'bun:test';
import { mkdirSync } from 'fs';
import { ProcessManager } from '../core/ProcessManager';
import { cleanupTestLogs, waitForStatus } from './utils/test-helpers';

beforeEach(() => {
  cleanupTestLogs();
  mkdirSync('test-logs', { recursive: true });
});

afterEach(() => {
  cleanupTestLogs();
});

describe('ProcessManager with Queue Integration', () => {
  
  describe('Default Behavior (No Queue)', () => {
    test('default manager preserves v1.x behavior', () => {
      const manager = new ProcessManager();
      
      const info = manager.start({ 
        cmd: ['echo', 'test'], 
        logDir: 'test-logs' 
      });
      
      expect(info.status).toBe('running');
      expect(info.pid).toBeGreaterThan(0);
      expect(manager.isQueuingEnabled()).toBe(false);
      expect(manager.supportsQueue).toBe(true);
      
      manager.killAll();
    });
    
    test('infinite concurrency allows unlimited tasks', () => {
      const manager = new ProcessManager();
      const tasks = [];
      
      for (let i = 0; i < 25; i++) {
        tasks.push(manager.start({ 
          cmd: ['sleep', '0.1'], 
          logDir: 'test-logs' 
        }));
      }
      
      // All should start immediately
      tasks.forEach(task => {
        expect(task.status).toBe('running');
        expect(task.pid).toBeGreaterThan(0);
      });
      
      manager.killAll();
    });
    
    test('async and sync APIs behave identically without queue', async () => {
      const manager = new ProcessManager();
      
      const syncTask = manager.start({ 
        cmd: ['echo', 'sync'], 
        logDir: 'test-logs' 
      });
      
      const asyncTask = await manager.startAsync({ 
        cmd: ['echo', 'async'], 
        logDir: 'test-logs' 
      });
      
      expect(syncTask.status).toBe('running');
      expect(asyncTask.status).toBe('running');
      expect(syncTask.pid).toBeGreaterThan(0);
      expect(asyncTask.pid).toBeGreaterThan(0);
      
      manager.killAll();
    });
  });
  
  describe('Queue Configuration', () => {
    test('enables queue with concurrency limit', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 3 }
      });
      
      expect(manager.isQueuingEnabled()).toBe(true);
      expect(manager.getQueueConcurrency()).toBe(3);
      expect(manager.isQueuePaused()).toBe(false);
    });
    
    test('respects concurrency limits', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      const tasks = Array.from({ length: 5 }, (_, i) =>
        manager.start({ 
          cmd: ['sleep', '0.2'], 
          logDir: 'test-logs' 
        })
      );
      
      // Count running vs queued
      const runningCount = tasks.filter(t => t.status === 'running').length;
      const queuedCount = tasks.filter(t => t.status === 'queued').length;
      
      expect(runningCount).toBeLessThanOrEqual(2);
      expect(queuedCount).toBeGreaterThan(0);
      expect(runningCount + queuedCount).toBe(5);
      
      manager.killAll();
      manager.clearQueue();
    });
    
    test('immediate flag bypasses queue', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Fill the concurrency limit
      const blocker = manager.start({ 
        cmd: ['sleep', '1'], 
        logDir: 'test-logs' 
      });
      expect(blocker.status).toBe('running');
      
      // Add task that should be queued
      const queued = manager.start({ 
        cmd: ['echo', 'queued'], 
        logDir: 'test-logs' 
      });
      expect(queued.status).toBe('queued');
      
      // Add immediate task that should bypass queue
      const immediate = manager.start({ 
        cmd: ['echo', 'immediate'], 
        logDir: 'test-logs',
        queue: { immediate: true }
      });
      expect(immediate.status).toBe('running');
      expect(immediate.pid).toBeGreaterThan(0);
      
      manager.killAll();
      manager.clearQueue();
    });
  });
  
  describe('Queue Management', () => {
    test('pause and resume queue', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Start a blocking task
      const blocker = manager.start({ 
        cmd: ['sleep', '0.5'], 
        logDir: 'test-logs' 
      });
      
      // Pause queue
      manager.pauseQueue();
      expect(manager.isQueuePaused()).toBe(true);
      
      // Add task while paused
      const task = manager.start({ 
        cmd: ['echo', 'test'], 
        logDir: 'test-logs' 
      });
      expect(task.status).toBe('queued');
      
      // Wait for blocker to finish
      await waitForStatus(manager, blocker.id, 'exited');
      
      // Task should still be queued due to pause
      const taskInfo = manager.list().find(t => t.id === task.id);
      expect(taskInfo?.status).toBe('queued');
      
      // Resume should start the task
      manager.resumeQueue();
      expect(manager.isQueuePaused()).toBe(false);
      
      await waitForStatus(manager, task.id, 'exited');
    });
    
    test('clear queue removes pending tasks', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Fill concurrency
      const blocker = manager.start({ 
        cmd: ['sleep', '1'], 
        logDir: 'test-logs' 
      });
      
      // Add tasks to queue
      const task1 = manager.start({ 
        cmd: ['echo', 'test1'], 
        logDir: 'test-logs' 
      });
      const task2 = manager.start({ 
        cmd: ['echo', 'test2'], 
        logDir: 'test-logs' 
      });
      
      expect(task1.status).toBe('queued');
      expect(task2.status).toBe('queued');
      
      const stats = manager.getQueueStats();
      expect(stats.size).toBe(2);
      
      // Clear queue
      manager.clearQueue();
      
      const newStats = manager.getQueueStats();
      expect(newStats.size).toBe(0);
      
      manager.killAll();
    });
    
    test('dynamic concurrency changes', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      expect(manager.getQueueConcurrency()).toBe(2);
      
      manager.setQueueConcurrency(5);
      expect(manager.getQueueConcurrency()).toBe(5);
      
      manager.setQueueConcurrency(1);
      expect(manager.getQueueConcurrency()).toBe(1);
    });
  });
  
  describe('Queue Statistics', () => {
    test('provides accurate queue statistics', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      let stats = manager.getQueueStats();
      expect(stats.size).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.paused).toBe(false);
      
      // Add tasks
      const tasks = Array.from({ length: 4 }, () =>
        manager.start({ 
          cmd: ['sleep', '0.5'], 
          logDir: 'test-logs' 
        })
      );
      
      stats = manager.getQueueStats();
      expect(stats.pending).toBeLessThanOrEqual(2);
      expect(stats.size).toBeGreaterThan(0);
      
      manager.killAll();
      manager.clearQueue();
    });
    
    test('queue state methods work correctly', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      expect(manager.isQueueEmpty()).toBe(true);
      expect(manager.isQueueIdle()).toBe(true);
      
      const task = manager.start({ 
        cmd: ['sleep', '0.2'], 
        logDir: 'test-logs' 
      });
      
      expect(manager.isQueueEmpty()).toBe(true); // No queued tasks
      expect(manager.isQueueIdle()).toBe(false); // Has running task
      
      manager.killAll();
    });
  });
  
  describe('Wait Operations', () => {
    test('waitForQueueIdle works', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      const tasks = Array.from({ length: 3 }, () =>
        manager.start({ 
          cmd: ['sleep', '0.1'], 
          logDir: 'test-logs' 
        })
      );
      
      expect(manager.isQueueIdle()).toBe(false);
      
      await manager.waitForQueueIdle();
      
      expect(manager.isQueueIdle()).toBe(true);
      
      // All tasks should be completed
      tasks.forEach(task => {
        const info = manager.list().find(t => t.id === task.id);
        expect(info?.status).toMatch(/exited|killed/);
      });
    });
    
    test('waitForQueueEmpty works', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Add blocking task
      const blocker = manager.start({ 
        cmd: ['sleep', '0.2'], 
        logDir: 'test-logs' 
      });
      
      // Add queued tasks
      const tasks = Array.from({ length: 3 }, () =>
        manager.start({ 
          cmd: ['echo', 'test'], 
          logDir: 'test-logs' 
        })
      );
      
      expect(manager.isQueueEmpty()).toBe(false);
      
      await manager.waitForQueueEmpty();
      
      expect(manager.isQueueEmpty()).toBe(true);
      
      manager.killAll();
    });
    
    test('waitForQueueSizeLessThan works', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Add blocking task
      const blocker = manager.start({ 
        cmd: ['sleep', '0.3'], 
        logDir: 'test-logs' 
      });
      
      // Add many queued tasks
      const tasks = Array.from({ length: 5 }, () =>
        manager.start({ 
          cmd: ['echo', 'test'], 
          logDir: 'test-logs' 
        })
      );
      
      expect(manager.getQueueStats().size).toBe(5);
      
      await manager.waitForQueueSizeLessThan(3);
      
      expect(manager.getQueueStats().size).toBeLessThan(3);
      
      manager.killAll();
      manager.clearQueue();
    });
  });
  
  describe('Async API', () => {
    test('startAsync waits for queue execution', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Start blocking task
      const blocker = manager.start({ 
        cmd: ['sleep', '0.2'], 
        logDir: 'test-logs' 
      });
      
      let taskStarted = false;
      
      // startAsync should wait until task actually starts
      const taskPromise = manager.startAsync({ 
        cmd: ['echo', 'async-test'], 
        logDir: 'test-logs' 
      }).then(info => {
        taskStarted = true;
        return info;
      });
      
      // Task shouldn't start immediately due to queue
      await new Promise(r => setTimeout(r, 50));
      
      // Wait for async task to complete queue execution
      const info = await taskPromise;
      expect(taskStarted).toBe(true);
      expect(info.status).toMatch(/running|exited/);
      
      manager.killAll();
    });
    
    test('startAsync with immediate flag executes immediately', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Fill concurrency
      const blocker = manager.start({ 
        cmd: ['sleep', '0.5'], 
        logDir: 'test-logs' 
      });
      
      // Immediate task should start right away
      const start = Date.now();
      const info = await manager.startAsync({ 
        cmd: ['echo', 'immediate'], 
        logDir: 'test-logs',
        queue: { immediate: true }
      });
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeLessThan(100); // Should be very fast
      expect(info.status).toMatch(/running|exited/);
      
      manager.killAll();
    });
  });
  
  describe('Backward Compatibility', () => {
    test('existing v1.x code works unchanged', () => {
      // This is exactly how v1.x code would look
      const manager = new ProcessManager(); // No queue config
      
      const task = manager.start({
        cmd: ['echo', 'hello'],
        logDir: 'test-logs'
      });
      
      expect(task.status).toBe('running');
      expect(task.pid).toBeGreaterThan(0);
      expect(typeof task.id).toBe('string');
      
      const allTasks = manager.list();
      const runningTasks = manager.listRunning();
      
      expect(allTasks).toHaveLength(1);
      expect(runningTasks).toHaveLength(1);
      
      manager.kill(task.id);
      
      const afterKill = manager.listRunning();
      expect(afterKill).toHaveLength(0);
    });
    
    test('queue features are opt-in', () => {
      const manager = new ProcessManager(); // Default behavior
      
      // Queue features exist but don't affect default behavior
      expect(manager.supportsQueue).toBe(true);
      expect(manager.isQueuingEnabled()).toBe(false);
      expect(manager.getQueueConcurrency()).toBe(Infinity);
      
      // Queue management methods are safe to call
      manager.pauseQueue(); // No-op
      manager.resumeQueue(); // No-op
      manager.clearQueue(); // No-op
      
      const stats = manager.getQueueStats();
      expect(stats.size).toBe(0);
      expect(stats.pending).toBe(0);
    });
  });
  
  describe('Feature Detection', () => {
    test('supports queue detection', () => {
      const disabledManager = new ProcessManager();
      const enabledManager = new ProcessManager({ queue: { concurrency: 5 } });
      
      expect(disabledManager.supportsQueue).toBe(true);
      expect(disabledManager.isQueuingEnabled()).toBe(false);
      
      expect(enabledManager.supportsQueue).toBe(true);
      expect(enabledManager.isQueuingEnabled()).toBe(true);
    });
    
    test('provides configuration information', () => {
      const manager = new ProcessManager({
        queue: { 
          concurrency: 3,
          emitQueueEvents: true
        }
      });
      
      expect(manager.getQueueConcurrency()).toBe(3);
      
      const stats = manager.getQueueStats();
      expect(stats.size).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.paused).toBe(false);
    });
  });
  
  describe('Error Handling', () => {
    test('queue errors dont break manager', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      // Add task that will fail
      const failTask = manager.start({
        cmd: ['nonexistent-command-xyz'],
        logDir: 'test-logs'
      });
      
      // Add normal task
      const goodTask = manager.start({
        cmd: ['echo', 'success'],
        logDir: 'test-logs'
      });
      
      // Wait for both to process
      await new Promise(r => setTimeout(r, 100));
      
      // Manager should still be functional
      const anotherTask = manager.start({
        cmd: ['echo', 'after-error'],
        logDir: 'test-logs'
      });
      
      expect(anotherTask.status).toMatch(/running|queued/);
      
      manager.killAll();
      manager.clearQueue();
    });
  });
});