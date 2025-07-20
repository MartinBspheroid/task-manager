// src/tests/mocks/MockQueue.ts

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { 
  IQueue, 
  QueueTaskOptions, 
  QueueContext, 
  QueueItem,
  QueueStats 
} from '../../core/interfaces/IQueue';

/** 
 * Mock queue implementation for testing
 * Provides controllable behavior and inspection capabilities
 */
export class MockQueue extends EventEmitter implements IQueue {
  private tasks = new Map<string, QueueItem>();
  private runningTasks = new Set<string>();
  private totalAdded = 0;
  private totalCompleted = 0;
  private totalFailed = 0;
  private _isPaused = false;
  private _concurrency: number;
  private executionDelay: number;

  constructor(options: MockQueueOptions = {}) {
    super();
    this._concurrency = options.concurrency ?? Infinity;
    this.executionDelay = options.executionDelay ?? 0;
  }

  async add<R>(
    fn: (context?: QueueContext) => Promise<R> | R,
    options?: QueueTaskOptions
  ): Promise<R> {
    const item: QueueItem<R> = {
      id: options?.id || randomUUID(),
      fn,
      options,
      addedAt: Date.now()
    };

    this.tasks.set(item.id, item);
    this.totalAdded++;
    this.emit('add', item);

    // Process the task
    return this.executeTask(item);
  }

  async addAll<R>(
    fns: Array<(context?: QueueContext) => Promise<R> | R>,
    options?: QueueTaskOptions
  ): Promise<R[]> {
    const promises = fns.map(fn => this.add(fn, options));
    return Promise.all(promises);
  }

  pause(): void {
    this._isPaused = true;
  }

  resume(): void {
    this._isPaused = false;
    // Process any pending tasks
    this.processPendingTasks();
  }

  clear(): void {
    this.tasks.clear();
    this.runningTasks.clear();
  }

  get size(): number {
    return this.tasks.size - this.runningTasks.size;
  }

  get pending(): number {
    return this.runningTasks.size;
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  async onEmpty(): Promise<void> {
    if (this.size === 0) return;
    
    return new Promise(resolve => {
      const listener = () => {
        if (this.size === 0) {
          this.off('next', listener);
          resolve();
        }
      };
      this.on('next', listener);
    });
  }

  async onIdle(): Promise<void> {
    if (this.pending === 0) return;
    
    return new Promise(resolve => {
      const listener = () => {
        if (this.pending === 0) {
          this.off('next', listener);
          resolve();
        }
      };
      this.on('next', listener);
    });
  }

  async onSizeLessThan(limit: number): Promise<void> {
    if (this.size < limit) return;
    
    return new Promise(resolve => {
      const listener = () => {
        if (this.size < limit) {
          this.off('next', listener);
          resolve();
        }
      };
      this.on('next', listener);
    });
  }

  sizeBy(filter: Partial<QueueTaskOptions>): number {
    return Array.from(this.tasks.values()).filter(item => {
      if (!item.options) return Object.keys(filter).length === 0;
      
      return Object.entries(filter).every(([key, value]) => {
        if (key === 'metadata') {
          return this.matchesMetadata(item.options?.metadata, value as Record<string, unknown>);
        }
        return (item.options as any)[key] === value;
      });
    }).length;
  }

  setPriority(id: string, priority: number): void {
    const item = this.tasks.get(id);
    if (item && item.options) {
      item.options.priority = priority;
      // Re-sort tasks by priority if needed
      this.sortTasksByPriority();
    }
  }

  stats(): QueueStats {
    return {
      size: this.size,
      pending: this.pending,
      paused: this.isPaused,
      totalAdded: this.totalAdded,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed
    };
  }

  async destroy(): Promise<void> {
    this.clear();
    this.removeAllListeners();
  }

  // Testing utilities

  /** Get all queued tasks for inspection */
  getTasks(): QueueItem[] {
    return Array.from(this.tasks.values());
  }

  /** Get running task IDs */
  getRunningTaskIds(): string[] {
    return Array.from(this.runningTasks);
  }

  /** Force execution of next task (for testing) */
  async executeNextTask(): Promise<void> {
    const pendingTasks = Array.from(this.tasks.values())
      .filter(task => !this.runningTasks.has(task.id) && !task.startedAt);
    
    if (pendingTasks.length > 0) {
      const nextTask = this.getNextTaskByPriority(pendingTasks);
      await this.executeTask(nextTask);
    }
  }

  /** Force execution of all pending tasks */
  async executeAllTasks(): Promise<void> {
    while (this.size > 0) {
      await this.executeNextTask();
    }
  }

  /** Set execution delay for testing timing */
  setExecutionDelay(delay: number): void {
    this.executionDelay = delay;
  }

  /** Simulate task failure */
  failNextTask(error: Error = new Error('Mock task failure')): void {
    this.once('start', (item) => {
      // Override the task function to throw error
      item.fn = () => {
        throw error;
      };
    });
  }

  private async executeTask<R>(item: QueueItem<R>): Promise<R> {
    // Wait if paused
    while (this._isPaused) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Wait for concurrency slot
    while (this.runningTasks.size >= this._concurrency) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    this.runningTasks.add(item.id);
    item.startedAt = Date.now();
    this.emit('start', item);
    this.emit('active', item);

    try {
      // Add execution delay for testing
      if (this.executionDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.executionDelay));
      }

      // Create context
      const context: QueueContext = {
        signal: item.options?.signal,
        metadata: item.options?.metadata,
        id: item.id
      };

      // Execute the task
      const result = await item.fn(context);
      
      // Mark as completed
      item.completedAt = Date.now();
      this.totalCompleted++;
      this.emit('complete', item, result);
      
      return result;
    } catch (error) {
      this.totalFailed++;
      this.emit('error', error as Error, item);
      throw error;
    } finally {
      this.runningTasks.delete(item.id);
      this.tasks.delete(item.id);
      this.emit('next');
      
      // Check if queue became empty or idle
      if (this.size === 0) {
        this.emit('empty');
      }
      if (this.pending === 0) {
        this.emit('idle');
      }
    }
  }

  private processPendingTasks(): void {
    // Process tasks up to concurrency limit
    const availableSlots = this._concurrency - this.runningTasks.size;
    const pendingTasks = Array.from(this.tasks.values())
      .filter(task => !this.runningTasks.has(task.id) && !task.startedAt)
      .slice(0, availableSlots);

    pendingTasks.forEach(task => {
      this.executeTask(task).catch(() => {
        // Error handling is done in executeTask
      });
    });
  }

  private getNextTaskByPriority(tasks: QueueItem[]): QueueItem {
    return tasks.sort((a, b) => {
      const priorityA = a.options?.priority ?? 0;
      const priorityB = b.options?.priority ?? 0;
      return priorityB - priorityA; // Higher priority first
    })[0]!;
  }

  private sortTasksByPriority(): void {
    // In a real implementation, this would re-order the internal queue
    // For mock purposes, we just need to ensure getNextTaskByPriority works correctly
  }

  private matchesMetadata(
    itemMetadata: Record<string, unknown> | undefined,
    filterMetadata: Record<string, unknown>
  ): boolean {
    if (!itemMetadata) return Object.keys(filterMetadata).length === 0;
    
    return Object.entries(filterMetadata).every(([key, value]) => 
      itemMetadata[key] === value
    );
  }
}

/** Configuration options for MockQueue */
export interface MockQueueOptions {
  /** Maximum concurrent tasks */
  concurrency?: number;
  
  /** Artificial delay for task execution (ms) */
  executionDelay?: number;
}