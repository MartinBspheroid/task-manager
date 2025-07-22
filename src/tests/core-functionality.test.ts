// src/tests/core-functionality.test.ts
// Consolidated core ProcessManager functionality tests
// Combines behavior-contract.test.ts and backward-compatibility.test.ts

import { expect, test, beforeEach, afterEach, describe } from 'bun:test';
import { existsSync } from 'fs';
import { ProcessManager } from '../core/ProcessManager';
import { setupTestEnvironment, teardownTestEnvironment, waitForStatus, TEST_LOG_DIR } from './utils/test-helpers';
import type { TaskStatus } from '../core/types';

beforeEach(setupTestEnvironment);
afterEach(teardownTestEnvironment);

describe('Core ProcessManager Functionality', () => {
  describe('Basic Task Lifecycle', () => {
    test('start() provides synchronous guarantees', () => {
      const manager = new ProcessManager();
      
      const before = Date.now();
      const info = manager.start({
        cmd: ['sleep', '1'],
        logDir: TEST_LOG_DIR
      });
      const after = Date.now();
      
      // Synchronous guarantees
      expect(after - before).toBeLessThan(100); // Returns immediately
      expect(info.status).toBe('running');       // Process is running
      expect(info.pid).toBeGreaterThan(0);       // PID is available
      expect(info.startedAt).toBeGreaterThan(0); // Timestamp is set
      expect(info.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/); // UUID v4
      
      manager.kill(info.id);
    });

    test('start() handles spawn failures gracefully', () => {
      const manager = new ProcessManager();
      
      const info = manager.start({
        cmd: ['nonexistentcommand12345'],
        logDir: TEST_LOG_DIR
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
        logDir: TEST_LOG_DIR,
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
      expect(info.logFile).toBe(`${TEST_LOG_DIR}/${info.id}.log`);
      
      manager.kill(info.id);
    });

    test('task status lifecycle', async () => {
      const manager = new ProcessManager();
      
      // Test successful process
      const successTask = manager.start({
        cmd: ['echo', 'success'],
        logDir: TEST_LOG_DIR
      });
      
      expect(successTask.status).toBe('running'); // Initial status
      await waitForStatus(manager, successTask.id, 'exited');
      
      const completedTask = manager.list().find(t => t.id === successTask.id);
      expect(completedTask?.status).toBe('exited');
      expect(completedTask?.exitedAt).toBeGreaterThan(completedTask!.startedAt);
      expect(completedTask?.exitCode).toBe(0);
      
      // Test killed process
      const killedTask = manager.start({
        cmd: ['sleep', '10'],
        logDir: TEST_LOG_DIR
      });
      
      expect(killedTask.status).toBe('running');
      manager.kill(killedTask.id);
      
      await waitForStatus(manager, killedTask.id, 'killed');
      await new Promise(r => setTimeout(r, 100));
      
      const deadTask = manager.list().find(t => t.id === killedTask.id);
      expect(deadTask?.status).toBe('killed');
    });
  });

  describe('Task Management', () => {
    test('list() returns all tasks', async () => {
      const manager = new ProcessManager();
      
      const task1 = manager.start({ cmd: ['sleep', '5'], logDir: TEST_LOG_DIR });
      const task2 = manager.start({ cmd: ['echo', 'quick'], logDir: TEST_LOG_DIR });
      const task3 = manager.start({ cmd: ['sleep', '5'], logDir: TEST_LOG_DIR });
      
      // Wait for quick task to complete
      await waitForStatus(manager, task2.id, 'exited');
      
      const allTasks = manager.list();
      
      // Contract requirements
      expect(allTasks.length).toBe(3);           // Returns all tasks
      expect(allTasks.find(t => t.id === task1.id)).toBeDefined(); // Includes running
      expect(allTasks.find(t => t.id === task2.id)).toBeDefined(); // Includes completed
      expect(allTasks.find(t => t.id === task3.id)).toBeDefined(); // All tasks present
      
      // Object reference consistency
      const firstTaskFromList = allTasks[0]!;
      const firstTaskFromSecondCall = manager.list()[0]!;
      expect(firstTaskFromList).toBe(firstTaskFromSecondCall); // Same object reference
      
      manager.killAll();
    });

    test('listRunning() filters correctly', async () => {
      const manager = new ProcessManager();
      
      const longTask = manager.start({ cmd: ['sleep', '5'], logDir: TEST_LOG_DIR });
      const quickTask = manager.start({ cmd: ['echo', 'done'], logDir: TEST_LOG_DIR });
      
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
      
      manager.kill(longTask.id);
    });

    test('kill() behavior and error handling', () => {
      const manager = new ProcessManager();
      
      // Test with invalid ID
      expect(() => {
        manager.kill('invalid-uuid');
      }).toThrow('task invalid-uuid not found');
      
      // Test with valid task
      const task = manager.start({ cmd: ['sleep', '5'], logDir: TEST_LOG_DIR });
      
      expect(() => {
        manager.kill(task.id); // Should not throw
      }).not.toThrow();
      
      // Test killing already dead task (should not throw)
      expect(() => {
        manager.kill(task.id); // Should be idempotent
      }).not.toThrow();
    });

    test('write() behavior and error handling', () => {
      const manager = new ProcessManager();
      
      // Test with invalid ID
      expect(() => {
        manager.write('invalid-uuid', 'test data');
      }).toThrow('task invalid-uuid not found');
      
      // Test with valid task
      const task = manager.start({ cmd: ['cat'], logDir: TEST_LOG_DIR }); // cat reads stdin
      
      expect(() => {
        manager.write(task.id, 'test input\n');
      }).not.toThrow();
      
      manager.kill(task.id);
    });
  });

  describe('Bulk Operations', () => {
    test('killAll() returns killed task IDs', async () => {
      const manager = new ProcessManager();
      
      // Test with no running tasks
      expect(manager.killAll()).toEqual([]);
      
      // Create multiple tasks
      const task1 = manager.start({ cmd: ['sleep', '10'], logDir: TEST_LOG_DIR });
      const task2 = manager.start({ cmd: ['sleep', '10'], logDir: TEST_LOG_DIR });
      const quickTask = manager.start({ cmd: ['echo', 'done'], logDir: TEST_LOG_DIR });
      
      // Wait for quick task to exit
      await waitForStatus(manager, quickTask.id, 'exited');
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

    test('killByTag() filters by tags', () => {
      const manager = new ProcessManager();
      
      const webTask1 = manager.start({
        cmd: ['sleep', '10'],
        logDir: TEST_LOG_DIR,
        tags: ['web-server', 'production']
      });
      
      const webTask2 = manager.start({
        cmd: ['sleep', '10'],
        logDir: TEST_LOG_DIR,
        tags: ['web-server']
      });
      
      const dbTask = manager.start({
        cmd: ['sleep', '10'],
        logDir: TEST_LOG_DIR,
        tags: ['database']
      });
      
      const noTagTask = manager.start({
        cmd: ['sleep', '10'],
        logDir: TEST_LOG_DIR
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
      
      manager.killAll();
    });
  });

  describe('Backward Compatibility (v1.x)', () => {
    test('immediate execution timing preserved', () => {
      const manager = new ProcessManager();
      const start = process.hrtime.bigint();
      const info = manager.start({ 
        cmd: ['echo', 'test'], 
        logDir: TEST_LOG_DIR 
      });
      const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
      
      // Core v1.x guarantees
      expect(duration).toBeLessThan(100);     // < 100ms execution time
      expect(info.status).toBe('running');   // Immediate execution
      expect(info.pid).toBeGreaterThan(0);   // Process spawned
      expect(info.startedAt).toBeGreaterThan(0); // Timestamp set
      expect(typeof info.id).toBe('string'); // UUID assigned
      
      manager.kill(info.id);
    });
    
    test('no queued status in default mode', () => {
      const manager = new ProcessManager();
      const statuses = new Set<TaskStatus>();
      
      // Start many tasks quickly
      for (let i = 0; i < 50; i++) {
        const info = manager.start({ 
          cmd: ['echo', i.toString()], 
          logDir: TEST_LOG_DIR 
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
          logDir: TEST_LOG_DIR 
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
      const info = manager.start({ cmd: ['echo', 'test'], logDir: TEST_LOG_DIR });
      
      expect(typeof info.id).toBe('string');
      expect(Array.isArray(info.cmd)).toBe(true);
      expect(typeof info.pid).toBe('number');
      expect(typeof info.startedAt).toBe('number');
      expect(typeof info.status).toBe('string');
      expect(typeof info.logFile).toBe('string');
      
      manager.kill(info.id);
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
          logDir: TEST_LOG_DIR 
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

    test('concurrent task creation performance', () => {
      const manager = new ProcessManager();
      const batchSize = 50;
      
      const start = process.hrtime.bigint();
      
      // Create batch of tasks rapidly
      const tasks = [];
      for (let i = 0; i < batchSize; i++) {
        tasks.push(manager.start({ 
          cmd: ['echo', `batch-task-${i}`], 
          logDir: TEST_LOG_DIR 
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

    test('memory usage remains bounded', async () => {
      const manager = new ProcessManager();
      
      // Force garbage collection baseline
      if (global.gc) global.gc();
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create a reasonable number of short-lived tasks
      for (let i = 0; i < 50; i++) {
        manager.start({ 
          cmd: ['echo', i.toString()], 
          logDir: TEST_LOG_DIR 
        });
      }
      
      // Allow tasks to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Force garbage collection
      if (global.gc) global.gc();
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory should not grow excessively (more realistic threshold)
      expect(memoryIncrease).toBeLessThan(500 * 1024 * 1024); // < 500MB
      
      manager.killAll();
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    test('handles rapid task creation/destruction', () => {
      const manager = new ProcessManager();
      
      // Rapidly create and kill tasks
      for (let i = 0; i < 50; i++) {
        const task = manager.start({ 
          cmd: ['sleep', '5'], 
          logDir: TEST_LOG_DIR 
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
          logDir: TEST_LOG_DIR 
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

  describe('File System Integration', () => {
    test('log file creation', async () => {
      const manager = new ProcessManager();
      
      const task = manager.start({
        cmd: ['echo', 'log test'],
        logDir: TEST_LOG_DIR
      });
      
      // Log file path format is guaranteed
      expect(task.logFile).toBe(`${TEST_LOG_DIR}/${task.id}.log`);
      
      // Log file creation happens during process initialization
      await new Promise(r => setTimeout(r, 200));
      expect(existsSync(task.logFile)).toBe(true);
      
      manager.kill(task.id);
    });
  });
});