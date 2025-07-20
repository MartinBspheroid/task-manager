// src/tests/process-queue.test.ts

import { expect, test, beforeEach, afterEach, describe } from 'bun:test';
import { ProcessQueue } from '../core/ProcessQueue';
import { cleanupTestLogs } from './utils/test-helpers';

beforeEach(() => {
  cleanupTestLogs();
});

afterEach(() => {
  cleanupTestLogs();
});

describe('ProcessQueue', () => {
  describe('Default Configuration (Disabled Mode)', () => {
    test('infinite concurrency executes immediately', async () => {
      const queue = new ProcessQueue(); // Default infinite concurrency
      let executed = 0;
      
      const tasks = Array.from({ length: 10 }, () => 
        queue.add(async () => {
          executed++;
          return executed;
        })
      );
      
      const results = await Promise.all(tasks);
      
      expect(executed).toBe(10);
      expect(results).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(queue.isDisabled).toBe(true);
      expect(queue.size).toBe(0);
      expect(queue.pending).toBe(0);
    });
    
    test('immediate flag works in disabled mode', async () => {
      const queue = new ProcessQueue();
      let result = '';
      
      await queue.add(() => { result += 'A'; }, { immediate: true });
      
      expect(result).toBe('A');
    });
    
    test('queue operations are no-ops in disabled mode', () => {
      const queue = new ProcessQueue();
      
      queue.pause();
      expect(queue.isPaused).toBe(false); // No-op queue ignores pause
      
      queue.resume();
      queue.clear();
      
      expect(queue.size).toBe(0);
      expect(queue.pending).toBe(0);
    });
  });
  
  describe('Concurrency Control', () => {
    test('respects concurrency limit', async () => {
      const queue = new ProcessQueue({ concurrency: 2 });
      const running = new Set<number>();
      let maxConcurrent = 0;
      
      const tasks = Array.from({ length: 5 }, (_, i) => 
        queue.add(async () => {
          running.add(i);
          maxConcurrent = Math.max(maxConcurrent, running.size);
          await new Promise(r => setTimeout(r, 50));
          running.delete(i);
          return i;
        })
      );
      
      const results = await Promise.all(tasks);
      
      expect(maxConcurrent).toBe(2);
      expect(results.sort()).toEqual([0, 1, 2, 3, 4]);
      expect(queue.isDisabled).toBe(false);
    });
    
    test('concurrency of 1 processes sequentially', async () => {
      const queue = new ProcessQueue({ concurrency: 1 });
      const order: number[] = [];
      
      const tasks = Array.from({ length: 3 }, (_, i) => 
        queue.add(async () => {
          order.push(i);
          await new Promise(r => setTimeout(r, 10));
        })
      );
      
      await Promise.all(tasks);
      
      expect(order).toEqual([0, 1, 2]);
    });
    
    test('dynamic concurrency changes', async () => {
      const queue = new ProcessQueue({ concurrency: 1 });
      
      expect(queue.concurrency).toBe(1);
      
      queue.setConcurrency(3);
      expect(queue.concurrency).toBe(3);
      
      // Test that it actually works with new concurrency
      const running = new Set<number>();
      let maxConcurrent = 0;
      
      const tasks = Array.from({ length: 4 }, (_, i) => 
        queue.add(async () => {
          running.add(i);
          maxConcurrent = Math.max(maxConcurrent, running.size);
          await new Promise(r => setTimeout(r, 50));
          running.delete(i);
        })
      );
      
      await Promise.all(tasks);
      expect(maxConcurrent).toBe(3);
    });
  });
  
  describe('Immediate Flag', () => {
    test('immediate flag bypasses queue', async () => {
      const queue = new ProcessQueue({ concurrency: 1 });
      const order: string[] = [];
      
      // Add slow task to queue
      const slowTask = queue.add(async () => {
        await new Promise(r => setTimeout(r, 100));
        order.push('slow');
      });
      
      // Add immediate task that should execute right away
      await queue.add(() => {
        order.push('immediate');
      }, { immediate: true });
      
      // Immediate task should complete first
      expect(order).toEqual(['immediate']);
      
      await slowTask;
      expect(order).toEqual(['immediate', 'slow']);
    });
    
    test('immediate flag works with higher concurrency', async () => {
      const queue = new ProcessQueue({ concurrency: 2 });
      let immediateExecuted = false;
      
      // Fill queue
      const tasks = Array.from({ length: 3 }, () => 
        queue.add(async () => {
          await new Promise(r => setTimeout(r, 50));
        })
      );
      
      // Add immediate task
      await queue.add(() => {
        immediateExecuted = true;
      }, { immediate: true });
      
      expect(immediateExecuted).toBe(true);
      
      await Promise.all(tasks);
    });
  });
  
  describe('Pause and Resume', () => {
    test('pause prevents new tasks from starting', async () => {
      const queue = new ProcessQueue({ concurrency: 1 });
      let executed = 0;
      
      // Add first task
      const firstTask = queue.add(async () => {
        executed++;
        await new Promise(r => setTimeout(r, 50));
      });
      
      // Pause queue
      queue.pause();
      expect(queue.isPaused).toBe(true);
      
      // Add second task (should be queued but not execute)
      const secondTaskPromise = queue.add(() => {
        executed++;
      });
      
      // Wait for first task to complete
      await firstTask;
      
      // Give time for second task to potentially execute
      await new Promise(r => setTimeout(r, 30));
      
      expect(executed).toBe(1); // Second task shouldn't have executed
      
      // Resume and wait for second task
      queue.resume();
      expect(queue.isPaused).toBe(false);
      
      await secondTaskPromise;
      expect(executed).toBe(2);
    });
    
    test('resume processes queued tasks', async () => {
      const queue = new ProcessQueue({ concurrency: 1 });
      queue.pause();
      
      let executed = 0;
      const tasks = Array.from({ length: 3 }, () => 
        queue.add(() => {
          executed++;
        })
      );
      
      // Tasks shouldn't execute while paused
      await new Promise(r => setTimeout(r, 20));
      expect(executed).toBe(0);
      
      // Resume should process all tasks
      queue.resume();
      await Promise.all(tasks);
      expect(executed).toBe(3);
    });
  });
  
  describe('Queue Management', () => {
    test('clear removes pending tasks', async () => {
      const queue = new ProcessQueue({ concurrency: 1 });
      let executed = 0;
      
      // Add blocking task
      const blocker = queue.add(async () => {
        await new Promise(r => setTimeout(r, 50));
        executed++;
      });
      
      // Add tasks that should be cleared
      queue.add(() => { executed++; });
      queue.add(() => { executed++; });
      queue.add(() => { executed++; });
      
      expect(queue.size).toBe(3); // 3 tasks waiting
      
      queue.clear();
      expect(queue.size).toBe(0); // All cleared
      
      await blocker;
      expect(executed).toBe(1); // Only the first task executed
    });
    
    test('queue statistics are accurate', async () => {
      const queue = new ProcessQueue({ concurrency: 2 });
      
      expect(queue.size).toBe(0);
      expect(queue.pending).toBe(0);
      expect(queue.isIdle()).toBe(true);
      expect(queue.isEmpty()).toBe(true);
      
      // Add tasks that will block
      const tasks = Array.from({ length: 5 }, () => 
        queue.add(async () => {
          await new Promise(r => setTimeout(r, 50));
        })
      );
      
      // Give a moment for tasks to start
      await new Promise(r => setTimeout(r, 10));
      
      expect(queue.pending).toBeLessThanOrEqual(2); // At most 2 running
      expect(queue.size).toBeGreaterThan(0); // Some waiting
      expect(queue.isIdle()).toBe(false);
      expect(queue.isEmpty()).toBe(false);
      
      await Promise.all(tasks);
      
      expect(queue.size).toBe(0);
      expect(queue.pending).toBe(0);
      expect(queue.isIdle()).toBe(true);
      expect(queue.isEmpty()).toBe(true);
    });
  });
  
  describe('Wait Methods', () => {
    test('onEmpty resolves when no tasks waiting', async () => {
      const queue = new ProcessQueue({ concurrency: 1 });
      
      // Add a blocking task first
      let blockingFinished = false;
      const blockingTask = queue.add(async () => {
        await new Promise(r => setTimeout(r, 100));
        blockingFinished = true;
      });
      
      // Now add more tasks that will be queued
      const tasks = Array.from({ length: 3 }, () => 
        queue.add(async () => {
          await new Promise(r => setTimeout(r, 20));
        })
      );
      
      // Wait for queue to have pending tasks
      await new Promise(r => setTimeout(r, 10));
      expect(queue.size).toBe(3); // Should have 3 tasks waiting
      
      let emptyResolved = false;
      const emptyPromise = queue.onEmpty().then(() => {
        emptyResolved = true;
      });
      
      // Empty shouldn't resolve while tasks are waiting
      await new Promise(r => setTimeout(r, 20));
      expect(emptyResolved).toBe(false);
      
      await Promise.all([blockingTask, ...tasks]);
      await emptyPromise;
      expect(emptyResolved).toBe(true);
    });
    
    test('onIdle resolves when no tasks waiting or running', async () => {
      const queue = new ProcessQueue({ concurrency: 2 });
      
      // Add tasks that will take some time
      const tasks = Array.from({ length: 4 }, () => 
        queue.add(async () => {
          await new Promise(r => setTimeout(r, 80));
        })
      );
      
      // Wait for tasks to start running
      await new Promise(r => setTimeout(r, 10));
      expect(queue.pending).toBe(2); // 2 running
      expect(queue.size).toBe(2); // 2 waiting
      
      let idleResolved = false;
      const idlePromise = queue.onIdle().then(() => {
        idleResolved = true;
      });
      
      // Idle shouldn't resolve while tasks are running/waiting
      await new Promise(r => setTimeout(r, 20));
      expect(idleResolved).toBe(false);
      
      await Promise.all(tasks);
      await idlePromise;
      expect(idleResolved).toBe(true);
    });
    
    test('onSizeLessThan resolves when queue size drops', async () => {
      const queue = new ProcessQueue({ concurrency: 1 });
      
      // Add blocking task
      const blocker = queue.add(async () => {
        await new Promise(r => setTimeout(r, 100));
      });
      
      // Add more tasks
      const moreTasks = Array.from({ length: 5 }, () => 
        queue.add(() => {})
      );
      
      expect(queue.size).toBe(5);
      
      let sizeResolved = false;
      const sizePromise = queue.onSizeLessThan(3).then(() => {
        sizeResolved = true;
      });
      
      // Should resolve as tasks complete
      await blocker;
      await sizePromise;
      
      expect(sizeResolved).toBe(true);
      expect(queue.size).toBeLessThan(3);
      
      await Promise.all(moreTasks);
    });
  });
  
  describe('Event Emission', () => {
    test('events are emitted when enabled', async () => {
      const queue = new ProcessQueue({ 
        concurrency: 2, 
        emitQueueEvents: true 
      });
      
      const events: string[] = [];
      
      queue.on('task:added', () => events.push('added'));
      queue.on('task:completed', () => events.push('completed'));
      queue.on('task:error', () => events.push('error'));
      queue.on('queue:paused', () => events.push('paused'));
      queue.on('queue:resumed', () => events.push('resumed'));
      
      await queue.add(() => {});
      
      expect(events).toContain('added');
      expect(events).toContain('completed');
      
      queue.pause();
      expect(events).toContain('paused');
      
      queue.resume();
      expect(events).toContain('resumed');
    });
    
    test('events are not emitted when disabled', async () => {
      const queue = new ProcessQueue({ 
        concurrency: 2, 
        emitQueueEvents: false 
      });
      
      const events: string[] = [];
      queue.on('task:added', () => events.push('added'));
      queue.on('task:completed', () => events.push('completed'));
      
      await queue.add(() => {});
      
      expect(events).toEqual([]);
    });
    
    test('error events are always emitted', async () => {
      const queue = new ProcessQueue({ concurrency: 1 });
      
      const errors: Error[] = [];
      queue.on('task:error', (error) => errors.push(error));
      
      try {
        await queue.add(() => {
          throw new Error('test error');
        });
      } catch {
        // Expected
      }
      
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe('test error');
    });
  });
  
  describe('Configuration Detection', () => {
    test('detects effectively disabled queue', () => {
      const disabled1 = new ProcessQueue();
      const disabled2 = new ProcessQueue({ concurrency: Infinity });
      const disabled3 = new ProcessQueue({ 
        concurrency: Infinity, 
        autoStart: true 
      });
      
      expect(disabled1.isDisabled).toBe(true);
      expect(disabled2.isDisabled).toBe(true);
      expect(disabled3.isDisabled).toBe(true);
    });
    
    test('detects enabled queue', () => {
      const enabled1 = new ProcessQueue({ concurrency: 5 });
      const enabled2 = new ProcessQueue({ 
        concurrency: Infinity, 
        interval: 1000, 
        intervalCap: 10 
      });
      
      expect(enabled1.isDisabled).toBe(false);
      expect(enabled2.isDisabled).toBe(false);
    });
    
    test('getStats returns accurate information', () => {
      const queue = new ProcessQueue({ 
        concurrency: 3, 
        emitQueueEvents: true 
      });
      
      const stats = queue.getStats();
      
      expect(stats.concurrency).toBe(3);
      expect(stats.emitEvents).toBe(true);
      expect(stats.isDisabled).toBe(false);
      expect(stats.size).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.isPaused).toBe(false);
    });
  });
  
  describe('Edge Cases', () => {
    test('handles zero concurrency gracefully', () => {
      const queue = new ProcessQueue({ concurrency: 0 });
      
      expect(queue.concurrency).toBe(0);
      expect(queue.isDisabled).toBe(false);
    });
    
    test('handles rapid task addition', async () => {
      const queue = new ProcessQueue({ concurrency: 2 });
      let completed = 0;
      
      const tasks = Array.from({ length: 100 }, (_, i) => 
        queue.add(async () => {
          completed++;
          return i;
        })
      );
      
      const results = await Promise.all(tasks);
      
      expect(completed).toBe(100);
      expect(results).toHaveLength(100);
      expect(new Set(results).size).toBe(100); // All unique
    });
    
    test('handles task errors without breaking queue', async () => {
      const queue = new ProcessQueue({ concurrency: 2 });
      
      const results = await Promise.allSettled([
        queue.add(() => 'success1'),
        queue.add(() => { throw new Error('fail'); }),
        queue.add(() => 'success2'),
        queue.add(() => { throw new Error('fail2'); }),
        queue.add(() => 'success3')
      ]);
      
      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.filter(r => r.status === 'rejected').length;
      
      expect(successes).toBe(3);
      expect(failures).toBe(2);
      
      // Queue should still be functional
      const final = await queue.add(() => 'final');
      expect(final).toBe('final');
    });
  });
});