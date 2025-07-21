// src/core/adapters/NullQueue.ts

import { EventEmitter } from 'events';
import type { 
  IQueue, 
  QueueTaskOptions, 
  QueueContext, 
  QueueStats 
} from '../interfaces/IQueue';

/** 
 * Null queue implementation that provides immediate execution
 * Used for backward compatibility when queuing is disabled
 */
export class NullQueue extends EventEmitter implements IQueue {
  private totalAdded = 0;
  private totalCompleted = 0;
  private totalFailed = 0;

  constructor() {
    super();
  }

  async add<R>(
    fn: (context?: QueueContext) => Promise<R> | R,
    options?: QueueTaskOptions
  ): Promise<R> {
    this.totalAdded++;
    
    // Create context for the task
    const context: QueueContext = {
      signal: options?.signal,
      metadata: options?.metadata,
      id: options?.id
    };

    try {
      // Execute immediately, no queuing
      const result = await fn(context);
      this.totalCompleted++;
      return result;
    } catch (error) {
      this.totalFailed++;
      throw error;
    }
  }

  async addAll<R>(
    fns: Array<(context?: QueueContext) => Promise<R> | R>,
    options?: QueueTaskOptions
  ): Promise<R[]> {
    // Execute all functions immediately in parallel
    const promises = fns.map(fn => this.add(fn, options));
    return Promise.all(promises);
  }

  pause(): void {
    // No-op: null queue doesn't queue, so can't pause
  }

  resume(): void {
    // No-op: null queue doesn't queue, so can't resume
  }

  clear(): void {
    // No-op: null queue doesn't hold tasks
  }

  get size(): number {
    // Always 0 since tasks execute immediately
    return 0;
  }

  get pending(): number {
    // Always 0 since tasks execute immediately
    return 0;
  }

  get isPaused(): boolean {
    // Never paused since there's no queue
    return false;
  }

  async onEmpty(): Promise<void> {
    // Always empty, so resolve immediately
    return Promise.resolve();
  }

  async onIdle(): Promise<void> {
    // Always idle, so resolve immediately
    return Promise.resolve();
  }

  async onSizeLessThan(_limit: number): Promise<void> {
    // Size is always 0, so always less than any positive limit
    return Promise.resolve();
  }

  sizeBy(_filter: Partial<QueueTaskOptions>): number {
    // No queued tasks to filter
    return 0;
  }

  setPriority(_id: string, _priority: number): void {
    // No-op: null queue doesn't manage priorities
  }

  stats(): QueueStats {
    return {
      size: 0,
      pending: 0,
      paused: false,
      totalAdded: this.totalAdded,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed
    };
  }

  async destroy(): Promise<void> {
    this.removeAllListeners();
  }
}