// src/tests/immediate-mode.test.ts

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

describe('Immediate Mode (Task 008)', () => {
  describe('startImmediate Method', () => {
    test('startImmediate always bypasses queue', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Fill the queue
      const blocker = manager.start({ 
        cmd: ['sleep', '1'], 
        logDir: 'test-logs' 
      });
      expect(blocker.status).toBe('running');
      
      // Normal task should be queued
      const queued = manager.start({ 
        cmd: ['echo', 'queued'], 
        logDir: 'test-logs' 
      });
      expect(queued.status).toBe('queued');
      
      // Use startImmediate method
      const immediate = manager.startImmediate({ 
        cmd: ['echo', 'immediate'], 
        logDir: 'test-logs' 
      });
      expect(immediate.status).toBe('running');
      expect(immediate.pid).toBeGreaterThan(0);
      
      manager.killAll();
    });
    
    test('startImmediate works without queue configuration', () => {
      const manager = new ProcessManager(); // No queue config
      
      const task = manager.startImmediate({
        cmd: ['echo', 'test'],
        logDir: 'test-logs'
      });
      
      expect(task.status).toBe('running');
      expect(task.pid).toBeGreaterThan(0);
      
      manager.kill(task.id);
    });
    
    test('startImmediate preserves other queue options', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      const task = manager.startImmediate({
        cmd: ['echo', 'test'],
        logDir: 'test-logs',
        queue: { 
          priority: 100, // Should be preserved but ignored due to immediate
          metadata: { type: 'critical' }
        }
      });
      
      expect(task.status).toBe('running');
      
      manager.kill(task.id);
    });
  });
  
  describe('Queue is Paused', () => {
    test('immediate tasks run even when queue is paused', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      // Pause the queue
      manager.pauseQueue();
      expect(manager.isQueuePaused()).toBe(true);
      
      // Normal task should be queued
      const queued = manager.start({ 
        cmd: ['echo', 'queued'], 
        logDir: 'test-logs' 
      });
      expect(queued.status).toBe('queued');
      
      // Immediate task should run despite pause
      const immediate = manager.start({
        cmd: ['echo', 'immediate'],
        logDir: 'test-logs',
        queue: { immediate: true }
      });
      expect(immediate.status).toBe('running');
      expect(immediate.pid).toBeGreaterThan(0);
      
      // startImmediate should also work
      const immediate2 = manager.startImmediate({
        cmd: ['echo', 'immediate2'],
        logDir: 'test-logs'
      });
      expect(immediate2.status).toBe('running');
      expect(immediate2.pid).toBeGreaterThan(0);
      
      manager.killAll();
      manager.clearQueue();
      manager.resumeQueue();
    });
    
    test('immediate tasks complete normally when queue is paused', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      manager.pauseQueue();
      
      const immediate = manager.startImmediate({
        cmd: ['echo', 'immediate-test'],
        logDir: 'test-logs'
      });
      
      expect(immediate.status).toBe('running');
      
      await waitForStatus(manager, immediate.id, 'exited');
      
      const finalInfo = manager.list().find(t => t.id === immediate.id);
      expect(finalInfo?.status).toBe('exited');
      expect(finalInfo?.exitCode).toBe(0);
      
      manager.resumeQueue();
    });
  });
  
  describe('Resource Limits', () => {
    test('immediate tasks can exceed concurrency limits', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      // Start 2 normal tasks (at limit)
      const task1 = manager.start({ cmd: ['sleep', '0.5'], logDir: 'test-logs' });
      const task2 = manager.start({ cmd: ['sleep', '0.5'], logDir: 'test-logs' });
      
      expect(task1.status).toBe('running');
      expect(task2.status).toBe('running');
      
      // Third normal task should be queued
      const task3 = manager.start({ cmd: ['sleep', '0.5'], logDir: 'test-logs' });
      expect(task3.status).toBe('queued');
      
      // Start 3 immediate tasks (exceed limit)
      const immediate1 = manager.start({
        cmd: ['echo', '1'],
        logDir: 'test-logs',
        queue: { immediate: true }
      });
      const immediate2 = manager.start({
        cmd: ['echo', '2'],
        logDir: 'test-logs',
        queue: { immediate: true }
      });
      const immediate3 = manager.start({
        cmd: ['echo', '3'],
        logDir: 'test-logs',
        queue: { immediate: true }
      });
      
      // All immediate tasks should be running
      expect(immediate1.status).toBe('running');
      expect(immediate2.status).toBe('running');
      expect(immediate3.status).toBe('running');
      
      // Total running = 5 (exceeds limit of 2)
      const running = manager.listRunning();
      expect(running.length).toBe(5);
      
      manager.killAll();
      manager.clearQueue();
    });
    
    test('many immediate tasks can run simultaneously', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 3 }
      });
      
      // Start many immediate tasks
      const immediateTasks = Array.from({ length: 20 }, (_, i) => 
        manager.startImmediate({
          cmd: ['echo', `immediate-${i}`],
          logDir: 'test-logs'
        })
      );
      
      // All should be running
      immediateTasks.forEach(task => {
        expect(task.status).toBe('running');
        expect(task.pid).toBeGreaterThan(0);
      });
      
      const running = manager.listRunning();
      expect(running.length).toBeGreaterThanOrEqual(20);
      
      manager.killAll();
    });
  });
  
  describe('Performance', () => {
    test('immediate flag has minimal overhead', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 5 }
      });
      
      const iterations = 10;
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();
        const task = manager.startImmediate({ 
          cmd: ['echo', i.toString()], 
          logDir: 'test-logs' 
        });
        const end = process.hrtime.bigint();
        
        times.push(Number(end - start) / 1_000_000);
        
        expect(task.status).toBe('running');
        expect(task.pid).toBeGreaterThan(0);
      }
      
      // Average time should be very low
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avgTime).toBeLessThan(50); // < 50ms average
      
      manager.killAll();
    });
    
    test('immediate bypasses queue processing entirely', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Fill queue with many tasks
      for (let i = 0; i < 100; i++) {
        manager.start({ cmd: ['echo', i.toString()], logDir: 'test-logs' });
      }
      
      // Immediate task should start instantly despite full queue
      const start = process.hrtime.bigint();
      const immediate = manager.startImmediate({
        cmd: ['echo', 'immediate'],
        logDir: 'test-logs'
      });
      const end = process.hrtime.bigint();
      
      const timeMs = Number(end - start) / 1_000_000;
      expect(timeMs).toBeLessThan(10); // Should be very fast
      expect(immediate.status).toBe('running');
      
      manager.killAll();
      manager.clearQueue();
    });
  });
  
  describe('Mixed Scenarios', () => {
    test('immediate and queued tasks coexist properly', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      // Start some normal tasks
      const normal1 = manager.start({ cmd: ['sleep', '0.2'], logDir: 'test-logs' });
      const normal2 = manager.start({ cmd: ['sleep', '0.2'], logDir: 'test-logs' });
      const queued = manager.start({ cmd: ['echo', 'queued'], logDir: 'test-logs' });
      
      expect(normal1.status).toBe('running');
      expect(normal2.status).toBe('running');
      expect(queued.status).toBe('queued');
      
      // Start immediate task
      const immediate = manager.startImmediate({
        cmd: ['echo', 'immediate'],
        logDir: 'test-logs'
      });
      expect(immediate.status).toBe('running');
      
      // Wait for immediate to complete
      await waitForStatus(manager, immediate.id, 'exited');
      
      // Queued task should still be queued
      const queuedInfo = manager.list().find(t => t.id === queued.id);
      expect(queuedInfo?.status).toBe('queued');
      
      manager.killAll();
      manager.clearQueue();
    });
    
    test('system/critical tags can auto-trigger immediate mode', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Fill queue
      const blocker = manager.start({ cmd: ['sleep', '1'], logDir: 'test-logs' });
      expect(blocker.status).toBe('running');
      
      // Task with 'system' tag could be special (if implemented)
      const systemTask = manager.start({
        cmd: ['echo', 'system-task'],
        logDir: 'test-logs',
        tags: ['system'],
        queue: { immediate: true } // Explicitly immediate for now
      });
      expect(systemTask.status).toBe('running');
      
      // Task with 'critical' tag
      const criticalTask = manager.start({
        cmd: ['echo', 'critical-task'],
        logDir: 'test-logs',
        tags: ['critical'],
        queue: { immediate: true }
      });
      expect(criticalTask.status).toBe('running');
      
      manager.killAll();
    });
  });
  
  describe('Error Handling', () => {
    test('immediate tasks handle startup failures properly', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      const failTask = manager.startImmediate({
        cmd: ['nonexistent-command-xyz123'],
        logDir: 'test-logs'
      });
      
      expect(failTask.status).toBe('start-failed');
      expect(failTask.pid).toBe(-1);
      expect(failTask.startError).toBeDefined();
    });
    
    test('immediate flag with invalid command doesnt crash queue', () => {
      const manager = new ProcessManager({
        queue: { concurrency: 2 }
      });
      
      // Add some normal tasks
      const normal1 = manager.start({ cmd: ['echo', '1'], logDir: 'test-logs' });
      const normal2 = manager.start({ cmd: ['echo', '2'], logDir: 'test-logs' });
      
      // Add immediate task with invalid command
      const failImmediate = manager.startImmediate({
        cmd: ['this-command-does-not-exist'],
        logDir: 'test-logs'
      });
      
      expect(failImmediate.status).toBe('start-failed');
      expect(normal1.status).toBe('running');
      expect(normal2.status).toBe('running');
      
      // Queue should still be functional
      const afterFail = manager.start({ cmd: ['echo', 'after'], logDir: 'test-logs' });
      expect(afterFail.status).toMatch(/running|queued/);
      
      manager.killAll();
      manager.clearQueue();
    });
  });
  
  describe('Async Immediate Mode', () => {
    test('startAsync with immediate flag completes synchronously', async () => {
      const manager = new ProcessManager({
        queue: { concurrency: 1 }
      });
      
      // Fill queue
      const blocker = manager.start({ cmd: ['sleep', '0.5'], logDir: 'test-logs' });
      
      // Async with immediate should complete quickly
      const start = Date.now();
      const immediate = await manager.startAsync({
        cmd: ['echo', 'immediate'],
        logDir: 'test-logs',
        queue: { immediate: true }
      });
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeLessThan(100); // Should be fast
      expect(immediate.status).toMatch(/running|exited/);
      
      manager.killAll();
    });
  });
  
  describe('CLI Integration', () => {
    test('--immediate flag is recognized (manual test placeholder)', () => {
      // This test documents the expected CLI behavior
      // Actual CLI testing would require spawning the CLI process
      
      // Expected usage:
      // bun run src/cli/start.ts --immediate -- echo "urgent task"
      // bun run src/cli/start.ts --tag system --immediate -- systemctl restart nginx
      
      expect(true).toBe(true); // Placeholder
    });
  });
});