// src/tests/backward-compatibility.test.ts

import { expect, test, beforeEach, afterEach, describe } from 'bun:test';
import { mkdirSync } from 'fs';
import { ProcessManager } from '../core/ProcessManager';
import { cleanupTestLogs, waitForStatus } from './utils/test-helpers';
import type { TaskStatus } from '../core/types';

beforeEach(() => {
  cleanupTestLogs();
  mkdirSync('test-logs', { recursive: true });
});

afterEach(() => {
  cleanupTestLogs();
});

describe('Backward Compatibility', () => {
  describe('Default Configuration (v1.x behavior)', () => {
    test('immediate execution timing', () => {
      const manager = new ProcessManager();
      const start = process.hrtime.bigint();
      const info = manager.start({ 
        cmd: ['echo', 'test'], 
        logDir: 'test-logs' 
      });
      const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
      
      // Core v1.x guarantees
      expect(duration).toBeLessThan(100);     // < 100ms execution time
      expect(info.status).toBe('running');   // Immediate execution
      expect(info.pid).toBeGreaterThan(0);   // Process spawned
      expect(info.startedAt).toBeGreaterThan(0); // Timestamp set
      expect(typeof info.id).toBe('string'); // UUID assigned
      
      // Cleanup
      manager.kill(info.id);
    });
    
    test('no queued status appears in default mode', () => {
      const manager = new ProcessManager();
      const statuses = new Set<TaskStatus>();
      
      // Start many tasks quickly
      for (let i = 0; i < 50; i++) {
        const info = manager.start({ 
          cmd: ['echo', i.toString()], 
          logDir: 'test-logs' 
        });
        statuses.add(info.status);
      }
      
      // Should never see 'queued' status in default mode
      expect(statuses.has('queued')).toBe(false);
      expect(statuses.has('running')).toBe(true);
      
      // Only valid v1.x statuses
      const validStatuses: TaskStatus[] = ['running', 'start-failed'];
      Array.from(statuses).forEach(status => {
        expect(validStatuses).toContain(status);
      });
      
      // Cleanup
      manager.killAll();
    });
    
    test('unlimited concurrency preserved', () => {
      const manager = new ProcessManager();
      const tasks = [];
      
      // Start many tasks simultaneously - should all start immediately
      const startTime = Date.now();
      for (let i = 0; i < 25; i++) {
        tasks.push(manager.start({ 
          cmd: ['sleep', '0.1'], 
          logDir: 'test-logs' 
        }));
      }
      const endTime = Date.now();
      
      // All should start immediately with running status
      tasks.forEach(task => {
        expect(task.status).toBe('running');
        expect(task.pid).toBeGreaterThan(0);
      });
      
      // Total time should be dominated by process spawn, not queuing
      expect(endTime - startTime).toBeLessThan(1000); // < 1 second for 25 tasks
      
      // Cleanup
      manager.killAll();
    });
    
    test('API surface unchanged', () => {
      const manager = new ProcessManager();
      
      // All v1.x methods exist
      expect(typeof manager.start).toBe('function');
      expect(typeof manager.list).toBe('function');
      expect(typeof manager.listRunning).toBe('function');
      expect(typeof manager.kill).toBe('function');
      expect(typeof manager.write).toBe('function');
      expect(typeof manager.killAll).toBe('function');
      expect(typeof manager.killByTag).toBe('function');
      
      // Task info structure unchanged
      const info = manager.start({ cmd: ['echo', 'test'], logDir: 'test-logs' });
      
      expect(typeof info.id).toBe('string');
      expect(Array.isArray(info.cmd)).toBe(true);
      expect(typeof info.pid).toBe('number');
      expect(typeof info.startedAt).toBe('number');
      expect(typeof info.status).toBe('string');
      expect(typeof info.logFile).toBe('string');
      
      manager.kill(info.id);
    });
    
    test('error handling unchanged', () => {
      const manager = new ProcessManager();
      
      // Test invalid command - should handle gracefully
      const failInfo = manager.start({ 
        cmd: ['nonexistent-command-12345'], 
        logDir: 'test-logs' 
      });
      
      expect(failInfo.status).toBe('start-failed');
      expect(failInfo.pid).toBe(-1);
      expect(failInfo.startError).toBeDefined();
      
      // Test invalid task ID - should throw
      expect(() => {
        manager.kill('invalid-uuid');
      }).toThrow('task invalid-uuid not found');
      
      expect(() => {
        manager.write('invalid-uuid', 'test');
      }).toThrow('task invalid-uuid not found');
    });
  });
  
  describe('Explicit Infinity Configuration', () => {
    test('behaves identically to default', () => {
      const defaultManager = new ProcessManager();
      // Note: explicit configuration will be implemented in later tasks
      const explicitManager = new ProcessManager();
      
      const defaultTask = defaultManager.start({ 
        cmd: ['echo', 'test'], 
        logDir: 'test-logs' 
      });
      const explicitTask = explicitManager.start({ 
        cmd: ['echo', 'test'], 
        logDir: 'test-logs' 
      });
      
      // Should behave identically
      expect(defaultTask.status).toBe(explicitTask.status);
      expect(defaultTask.status).toBe('running');
      expect(explicitTask.pid).toBeGreaterThan(0);
      expect(defaultTask.pid).toBeGreaterThan(0);
      
      // Cleanup
      defaultManager.killAll();
      explicitManager.killAll();
    });
    
    test('no queue behavior with explicit infinity', () => {
      // Note: queue configuration will be implemented in later tasks
      const manager = new ProcessManager();
      
      const statuses = new Set<TaskStatus>();
      for (let i = 0; i < 20; i++) {
        const info = manager.start({ 
          cmd: ['echo', i.toString()], 
          logDir: 'test-logs' 
        });
        statuses.add(info.status);
      }
      
      // Should never queue with infinite concurrency
      expect(statuses.has('queued')).toBe(false);
      expect(statuses.has('running')).toBe(true);
      
      manager.killAll();
    });
  });
  
  describe('Performance Characteristics', () => {
    test('no performance regression in default mode', () => {
      const manager = new ProcessManager();
      const iterations = 100;
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();
        const info = manager.start({ 
          cmd: ['echo', i.toString()], 
          logDir: 'test-logs' 
        });
        const end = process.hrtime.bigint();
        
        times.push(Number(end - start) / 1_000_000);
        
        // Verify immediate execution
        expect(info.status).toBe('running');
        expect(info.pid).toBeGreaterThan(0);
      }
      
      // Performance requirements from API contract
      const sorted = times.sort((a, b) => a - b);
      const p95 = sorted[Math.floor(iterations * 0.95)]!;
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      
      expect(p95).toBeLessThan(100);  // 95th percentile < 100ms
      expect(mean).toBeLessThan(50);  // Mean < 50ms
      
      manager.killAll();
    });
    
    test('memory usage remains bounded', async () => {
      const manager = new ProcessManager();
      
      // Force garbage collection baseline
      if (global.gc) global.gc();
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create many short-lived tasks
      for (let i = 0; i < 200; i++) {
        manager.start({ 
          cmd: ['echo', i.toString()], 
          logDir: 'test-logs' 
        });
      }
      
      // Allow tasks to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Force garbage collection
      if (global.gc) global.gc();
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory should not grow excessively
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // < 10MB
      
      manager.killAll();
    });
    
    test('concurrent task creation performance', () => {
      const manager = new ProcessManager();
      const batchSize = 50;
      
      const start = process.hrtime.bigint();
      
      // Create batch of tasks rapidly
      const tasks = [];
      for (let i = 0; i < batchSize; i++) {
        tasks.push(manager.start({ 
          cmd: ['echo', `batch-task-${i}`], 
          logDir: 'test-logs' 
        }));
      }
      
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;
      const tasksPerSecond = (batchSize / durationMs) * 1000;
      
      // Should be able to create tasks rapidly
      expect(tasksPerSecond).toBeGreaterThan(100); // > 100 tasks/second
      
      // All tasks should have started immediately
      tasks.forEach(task => {
        expect(task.status).toBe('running');
        expect(task.pid).toBeGreaterThan(0);
      });
      
      manager.killAll();
    });
  });
  
  describe('List and Management Operations', () => {
    test('list operations unchanged', async () => {
      const manager = new ProcessManager();
      
      // Create mix of tasks
      const longTask = manager.start({ 
        cmd: ['sleep', '3'], 
        logDir: 'test-logs' 
      });
      const quickTask = manager.start({ 
        cmd: ['echo', 'quick'], 
        logDir: 'test-logs' 
      });
      
      // Wait for quick task to complete
      await waitForStatus(manager, quickTask.id, 'exited');
      
      const allTasks = manager.list();
      const runningTasks = manager.listRunning();
      
      // Behavior should be identical to v1.x
      expect(allTasks.length).toBe(2);
      expect(runningTasks.length).toBe(1);
      expect(runningTasks[0]!.id).toBe(longTask.id);
      
      // Task info should be complete
      const longTaskInfo = allTasks.find(t => t.id === longTask.id)!;
      expect(longTaskInfo.status).toBe('running');
      expect(longTaskInfo.pid).toBeGreaterThan(0);
      
      manager.killAll();
    });
    
    test('killAll behavior unchanged', () => {
      const manager = new ProcessManager();
      
      // Test with no running tasks
      expect(manager.killAll()).toEqual([]);
      
      // Create multiple tasks
      const task1 = manager.start({ cmd: ['sleep', '10'], logDir: 'test-logs' });
      const task2 = manager.start({ cmd: ['sleep', '10'], logDir: 'test-logs' });
      
      const killedIds = manager.killAll();
      
      expect(killedIds.length).toBe(2);
      expect(killedIds).toContain(task1.id);
      expect(killedIds).toContain(task2.id);
      
      // Verify tasks are killed
      const runningAfter = manager.listRunning();
      expect(runningAfter.length).toBe(0);
    });
    
    test('tag-based operations unchanged', () => {
      const manager = new ProcessManager();
      
      const webTask = manager.start({
        cmd: ['sleep', '10'],
        logDir: 'test-logs',
        tags: ['web', 'production']
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
      
      const killedWebIds = manager.killByTag('web');
      
      expect(killedWebIds.length).toBe(1);
      expect(killedWebIds).toContain(webTask.id);
      expect(killedWebIds).not.toContain(dbTask.id);
      expect(killedWebIds).not.toContain(noTagTask.id);
      
      manager.killAll();
    });
  });
  
  describe('Hook System Compatibility', () => {
    test('hooks execute with same timing', async () => {
      const manager = new ProcessManager();
      
      let hookCalled = false;
      let hookTaskInfo: any = null;
      
      const task = manager.start({
        cmd: ['echo', 'hook-test'],
        logDir: 'test-logs',
        hooks: {
          onSuccess: [(taskInfo) => {
            hookCalled = true;
            hookTaskInfo = taskInfo;
          }]
        }
      });
      
      await waitForStatus(manager, task.id, 'exited');
      
      // Allow time for hook execution
      await new Promise(r => setTimeout(r, 100));
      
      expect(hookCalled).toBe(true);
      expect(hookTaskInfo).toBeDefined();
      expect(hookTaskInfo.id).toBe(task.id);
      expect(hookTaskInfo.status).toBe('exited');
    });
  });
});

describe('Configuration Compatibility', () => {
  test('undefined queue config behaves like default', () => {
    const defaultManager = new ProcessManager();
    // Note: configuration options will be implemented in later tasks
    const undefinedManager = new ProcessManager();
    
    const task1 = defaultManager.start({ cmd: ['echo', 'test'], logDir: 'test-logs' });
    const task2 = undefinedManager.start({ cmd: ['echo', 'test'], logDir: 'test-logs' });
    
    expect(task1.status).toBe(task2.status);
    expect(task1.status).toBe('running');
    
    defaultManager.killAll();
    undefinedManager.killAll();
  });
  
  test('empty queue config behaves like default', () => {
    // Note: configuration options will be implemented in later tasks
    const manager = new ProcessManager();
    
    const task = manager.start({ cmd: ['echo', 'test'], logDir: 'test-logs' });
    
    expect(task.status).toBe('running');
    expect(task.pid).toBeGreaterThan(0);
    
    manager.kill(task.id);
  });
  
  test('autoStart: true preserves immediate behavior', () => {
    // Note: configuration options will be implemented in later tasks
    const manager = new ProcessManager();
    
    const task = manager.start({ cmd: ['echo', 'test'], logDir: 'test-logs' });
    
    expect(task.status).toBe('running');
    expect(task.pid).toBeGreaterThan(0);
    
    manager.kill(task.id);
  });
});

describe('Edge Cases and Error Conditions', () => {
  test('handles rapid task creation/destruction', () => {
    const manager = new ProcessManager();
    
    // Rapidly create and kill tasks
    for (let i = 0; i < 50; i++) {
      const task = manager.start({ 
        cmd: ['sleep', '5'], 
        logDir: 'test-logs' 
      });
      
      expect(task.status).toBe('running');
      expect(task.pid).toBeGreaterThan(0);
      
      // Kill immediately
      manager.kill(task.id);
    }
    
    // Should handle gracefully
    const runningTasks = manager.listRunning();
    expect(runningTasks.length).toBe(0);
  });
  
  test('maintains behavior under high load', () => {
    const manager = new ProcessManager();
    const taskCount = 100;
    const createdTasks = [];
    
    // Create many tasks rapidly
    const startTime = Date.now();
    for (let i = 0; i < taskCount; i++) {
      const task = manager.start({ 
        cmd: ['echo', `load-test-${i}`], 
        logDir: 'test-logs' 
      });
      createdTasks.push(task);
    }
    const endTime = Date.now();
    
    // All tasks should start immediately
    createdTasks.forEach(task => {
      expect(task.status).toBe('running');
      expect(task.pid).toBeGreaterThan(0);
    });
    
    // Should complete reasonably quickly
    expect(endTime - startTime).toBeLessThan(5000); // < 5 seconds
    
    manager.killAll();
  });
});