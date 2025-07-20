// src/tests/task011-priority-support.test.ts

import { test, expect, describe } from 'bun:test';
import { ProcessManager } from '../core/ProcessManager';
import { ProcessQueue } from '../core/ProcessQueue';
import { PRIORITY } from '../core/types';
import { mkdirSync } from 'fs';

function createTestManager() {
  // Ensure test-logs directory exists
  mkdirSync('test-logs', { recursive: true });
  
  return new ProcessManager({
    defaultLogDir: 'test-logs',
    queue: { 
      concurrency: 1, // Limit to ensure queueing
      emitQueueEvents: true
    }
  });
}

function createTestQueue() {
  return new ProcessQueue({
    concurrency: 1,
    emitQueueEvents: true
  });
}

describe('Task 011: Priority Support', () => {
  describe('Priority Constants', () => {
    test('priority constants are defined correctly', () => {
      expect(PRIORITY.CRITICAL).toBe(1000);
      expect(PRIORITY.HIGH).toBe(100);
      expect(PRIORITY.NORMAL).toBe(0);
      expect(PRIORITY.LOW).toBe(-100);
      expect(PRIORITY.BATCH).toBe(-1000);
    });
  });

  describe('Priority-Based Task Ordering', () => {
    test('tasks execute in priority order (high to low)', async () => {
      const queue = createTestQueue();
      const results: number[] = [];
      
      // Start a blocking task to ensure others queue up
      const blocker = queue.add(async () => {
        await new Promise(r => setTimeout(r, 100));
        results.push(0);
      });
      
      // Add tasks with different priorities
      const tasks = [
        queue.add(() => results.push(1), { priority: PRIORITY.LOW }), // Should run last
        queue.add(() => results.push(2), { priority: PRIORITY.HIGH }), // Should run first  
        queue.add(() => results.push(3), { priority: PRIORITY.NORMAL }), // Should run middle
        queue.add(() => results.push(4), { priority: PRIORITY.CRITICAL }) // Should run before high
      ];
      
      // Wait for all to complete
      await Promise.all([blocker, ...tasks]);
      
      // Should run in priority order: 0 (blocker), 4 (CRITICAL), 2 (HIGH), 3 (NORMAL), 1 (LOW)
      expect(results).toEqual([0, 4, 2, 3, 1]);
    });

    test('tasks with same priority maintain FIFO order', async () => {
      const queue = createTestQueue();
      const results: number[] = [];
      
      // Start blocking task
      const blocker = queue.add(async () => {
        await new Promise(r => setTimeout(r, 50));
        results.push(0);
      });
      
      // Add multiple tasks with same priority
      const tasks = [
        queue.add(() => results.push(1), { priority: PRIORITY.NORMAL }),
        queue.add(() => results.push(2), { priority: PRIORITY.NORMAL }),
        queue.add(() => results.push(3), { priority: PRIORITY.NORMAL })
      ];
      
      await Promise.all([blocker, ...tasks]);
      
      // Should maintain FIFO order for same priority
      expect(results).toEqual([0, 1, 2, 3]);
    });

    test('tasks with no specified priority default to NORMAL (0)', async () => {
      const queue = createTestQueue();
      const results: number[] = [];
      
      // Start blocking task
      const blocker = queue.add(async () => {
        await new Promise(r => setTimeout(r, 50));
        results.push(0);
      });
      
      // Add tasks: one with explicit NORMAL, one without priority, one HIGH
      const tasks = [
        queue.add(() => results.push(1)), // No priority = NORMAL (0)
        queue.add(() => results.push(2), { priority: PRIORITY.HIGH }), // Should run first
        queue.add(() => results.push(3), { priority: PRIORITY.NORMAL }) // Explicit NORMAL
      ];
      
      await Promise.all([blocker, ...tasks]);
      
      // HIGH should run first, then FIFO for the NORMAL priority tasks
      expect(results).toEqual([0, 2, 1, 3]);
    });
  });

  describe('Priority Aging', () => {
    test('priority aging increases priority over time', () => {
      const queue = createTestQueue();
      
      const baseTime = Date.now();
      const options = {
        priority: PRIORITY.NORMAL,
        aging: {
          enabled: true,
          increment: 10, // 10 priority points per minute
          maxPriority: PRIORITY.HIGH,
          queuedAt: baseTime - (2 * 60 * 1000) // 2 minutes ago
        }
      };
      
      const effectivePriority = queue.calculateCurrentPriority(options);
      
      // Should be base (0) + (2 minutes * 10 points/minute) = 20
      expect(effectivePriority).toBe(20);
    });

    test('priority aging respects maximum priority', () => {
      const queue = createTestQueue();
      
      const baseTime = Date.now();
      const options = {
        priority: PRIORITY.NORMAL,
        aging: {
          enabled: true,
          increment: 10,
          maxPriority: PRIORITY.HIGH, // 100
          queuedAt: baseTime - (20 * 60 * 1000) // 20 minutes ago (would be 200 without cap)
        }
      };
      
      const effectivePriority = queue.calculateCurrentPriority(options);
      
      // Should be capped at maxPriority (100)
      expect(effectivePriority).toBe(PRIORITY.HIGH);
    });

    test('priority aging disabled returns base priority', () => {
      const queue = createTestQueue();
      
      const options = {
        priority: PRIORITY.LOW,
        aging: {
          enabled: false,
          increment: 10,
          maxPriority: PRIORITY.HIGH,
          queuedAt: Date.now() - (10 * 60 * 1000) // 10 minutes ago
        }
      };
      
      const effectivePriority = queue.calculateCurrentPriority(options);
      
      // Should return base priority since aging is disabled
      expect(effectivePriority).toBe(PRIORITY.LOW);
    });
  });

  describe('Dynamic Priority Adjustment', () => {
    test('setPriority updates task priority in queue', async () => {
      const manager = createTestManager();
      
      // Start a blocking task
      const blocker = manager.start({ 
        cmd: ['sleep', '0.1'], 
        logDir: 'test-logs'
      });
      
      // Add tasks with different priorities
      const task1 = manager.start({ 
        cmd: ['echo', 'low'], 
        logDir: 'test-logs',
        queue: { priority: PRIORITY.LOW, id: 'task1' }
      });
      
      const task2 = manager.start({ 
        cmd: ['echo', 'normal'], 
        logDir: 'test-logs',
        queue: { priority: PRIORITY.NORMAL, id: 'task2' }
      });
      
      // Wait a moment for tasks to be queued
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Elevate task1 priority
      const success = manager.reprioritizeTask(task1.id, PRIORITY.CRITICAL);
      expect(success).toBe(true);
      
      // Wait for completion
      await manager.waitForTask(blocker.id);
      await manager.waitForQueueIdle();
    });

    test('setPriority returns false for non-existent task', () => {
      const manager = createTestManager();
      
      const success = manager.reprioritizeTask('non-existent-id', PRIORITY.HIGH);
      expect(success).toBe(false);
    });

    test('setPriority returns false for running task', async () => {
      const manager = createTestManager();
      
      // Start a task that will run immediately
      const task = manager.start({ 
        cmd: ['sleep', '0.1'], 
        logDir: 'test-logs'
      });
      
      // Wait a moment for task to start running
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const success = manager.reprioritizeTask(task.id, PRIORITY.HIGH);
      expect(success).toBe(false);
      
      await manager.waitForTask(task.id);
    });
  });

  describe('Priority-Based Task Listing', () => {
    test('getTasksByPriority returns tasks sorted by priority', async () => {
      const manager = createTestManager();
      
      // Start blocking task
      const blocker = manager.start({ 
        cmd: ['sleep', '0.2'], 
        logDir: 'test-logs'
      });
      
      // Add tasks with different priorities
      manager.start({ 
        cmd: ['echo', 'low'], 
        logDir: 'test-logs',
        queue: { priority: PRIORITY.LOW, id: 'low-task' }
      });
      
      manager.start({ 
        cmd: ['echo', 'high'], 
        logDir: 'test-logs',
        queue: { priority: PRIORITY.HIGH, id: 'high-task' }
      });
      
      manager.start({ 
        cmd: ['echo', 'normal'], 
        logDir: 'test-logs',
        queue: { priority: PRIORITY.NORMAL, id: 'normal-task' }
      });
      
      // Wait for tasks to be queued
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const tasksByPriority = manager.getTasksByPriority();
      
      // Should be sorted by priority (highest first)
      expect(tasksByPriority.length).toBeGreaterThan(0);
      if (tasksByPriority.length > 1) {
        for (let i = 0; i < tasksByPriority.length - 1; i++) {
          const currentTask = tasksByPriority[i];
          const nextTask = tasksByPriority[i + 1];
          if (currentTask && nextTask) {
            expect(currentTask.priority).toBeGreaterThanOrEqual(nextTask.priority);
          }
        }
      }
      
      await manager.waitForTask(blocker.id);
      await manager.waitForQueueIdle();
    });

    test('getPriorityStats returns correct distribution', async () => {
      const manager = createTestManager();
      
      // Start blocking task
      const blocker = manager.start({ 
        cmd: ['sleep', '0.1'], 
        logDir: 'test-logs'
      });
      
      // Add tasks with different priorities
      manager.start({ 
        cmd: ['echo', 'high1'], 
        logDir: 'test-logs',
        queue: { priority: PRIORITY.HIGH }
      });
      
      manager.start({ 
        cmd: ['echo', 'high2'], 
        logDir: 'test-logs',
        queue: { priority: PRIORITY.HIGH }
      });
      
      manager.start({ 
        cmd: ['echo', 'normal'], 
        logDir: 'test-logs',
        queue: { priority: PRIORITY.NORMAL }
      });
      
      manager.start({ 
        cmd: ['echo', 'low'], 
        logDir: 'test-logs',
        queue: { priority: PRIORITY.LOW }
      });
      
      // Wait for tasks to be queued
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const stats = manager.getPriorityStats();
      
      expect(stats.highPriority).toBe(2); // Two HIGH priority tasks
      expect(stats.normal).toBe(1); // One NORMAL priority task
      expect(stats.lowPriority).toBe(1); // One LOW priority task
      
      await manager.waitForTask(blocker.id);
      await manager.waitForQueueIdle();
    });
  });

  describe('Integration with ProcessManager', () => {
    test('ProcessManager respects task priorities in queue', async () => {
      const manager = createTestManager();
      let executionOrder: string[] = [];
      
      // Start a long-running blocking task to ensure other tasks queue up
      const blockerPromise = manager.startAndWait({ 
        cmd: ['sleep', '0.2'], // Longer blocking task
        logDir: 'test-logs'
      }).then(() => executionOrder.push('blocker'));
      
      // Wait a moment to ensure blocker is running
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Add tasks with different priorities while blocker is running
      const lowTask = manager.startAndWait({ 
        cmd: ['echo', 'low'], 
        logDir: 'test-logs',
        queue: { priority: PRIORITY.LOW }
      }).then(() => executionOrder.push('low'));
      
      const highTask = manager.startAndWait({ 
        cmd: ['echo', 'high'], 
        logDir: 'test-logs',
        queue: { priority: PRIORITY.HIGH }
      }).then(() => executionOrder.push('high'));
      
      const normalTask = manager.startAndWait({ 
        cmd: ['echo', 'normal'], 
        logDir: 'test-logs',
        queue: { priority: PRIORITY.NORMAL }
      }).then(() => executionOrder.push('normal'));
      
      // Wait for all tasks to complete
      await Promise.all([blockerPromise, lowTask, highTask, normalTask]);
      
      // Verify execution order: blocker, high, normal, low
      expect(executionOrder).toEqual(['blocker', 'high', 'normal', 'low']);
    });

    test('tasks with immediate flag bypass priority queue', async () => {
      const manager = createTestManager();
      const results: string[] = [];
      
      // Start tasks with different priorities, some immediate
      const promises = [
        manager.startAndWait({ 
          cmd: ['echo', 'immediate'], 
          logDir: 'test-logs',
          queue: { immediate: true, priority: PRIORITY.LOW }
        }).then(() => results.push('immediate')),
        
        manager.startAndWait({ 
          cmd: ['echo', 'high'], 
          logDir: 'test-logs',
          queue: { priority: PRIORITY.HIGH }
        }).then(() => results.push('high')),
        
        manager.startAndWait({ 
          cmd: ['echo', 'normal'], 
          logDir: 'test-logs',
          queue: { priority: PRIORITY.NORMAL }
        }).then(() => results.push('normal'))
      ];
      
      await Promise.all(promises);
      
      // Immediate task should complete regardless of its low priority
      expect(results).toContain('immediate');
      expect(results).toContain('high');
      expect(results).toContain('normal');
    });
  });
});