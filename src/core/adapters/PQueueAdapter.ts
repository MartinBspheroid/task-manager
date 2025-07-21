// src/core/adapters/PQueueAdapter.ts

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { 
  IQueue, 
  QueueTaskOptions, 
  QueueContext, 
  QueueItem,
  QueueStats 
} from '../interfaces/IQueue';

// Note: p-queue import will be added when implementing core functionality
// For now, we define the interface to establish the adapter pattern

/** P-Queue adapter implementing the IQueue interface */
export class PQueueAdapter extends EventEmitter implements IQueue {
  private items = new Map<string, QueueItem>();
  private totalAdded = 0;
  private totalCompleted = 0;
  private totalFailed = 0;
  private _isPaused = false;

  constructor(private options: PQueueAdapterOptions = {}) {
    super();
    // p-queue initialization will be added in implementation phase
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

    this.items.set(item.id, item);
    this.totalAdded++;
    this.emit('add', item);

    try {
      // Create context for the task
      const context: QueueContext = {
        signal: options?.signal,
        metadata: options?.metadata,
        id: item.id
      };

      // Mark as started
      item.startedAt = Date.now();
      this.emit('start', item);
      this.emit('active', item);

      // Execute the task
      const result = await fn(context);
      
      // Mark as completed
      item.completedAt = Date.now();
      this.totalCompleted++;
      this.emit('complete', item, result);
      this.emit('next');
      
      // Check if queue is now idle
      if (this.pending === 0) {
        this.emit('idle');
      }
      
      // Check if queue is now empty
      if (this.size === 0) {
        this.emit('empty');
      }

      return result;
    } catch (error) {
      this.totalFailed++;
      this.emit('error', error as Error, item);
      this.emit('next');
      throw error;
    } finally {
      this.items.delete(item.id);
    }
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
    // p-queue pause implementation will be added
  }

  resume(): void {
    this._isPaused = false;
    // p-queue resume implementation will be added
  }

  clear(): void {
    this.items.clear();
    // p-queue clear implementation will be added
  }

  get size(): number {
    // Will return p-queue size in implementation
    return this.items.size;
  }

  get pending(): number {
    // Will return p-queue pending in implementation
    return Array.from(this.items.values())
      .filter(item => item.startedAt && !item.completedAt).length;
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  async onEmpty(): Promise<void> {
    if (this.size === 0) return;
    
    return new Promise(resolve => {
      const listener = () => {
        this.off('empty', listener);
        resolve();
      };
      this.on('empty', listener);
    });
  }

  async onIdle(): Promise<void> {
    if (this.pending === 0) return;
    
    return new Promise(resolve => {
      const listener = () => {
        this.off('idle', listener);
        resolve();
      };
      this.on('idle', listener);
    });
  }

  async onSizeLessThan(limit: number): Promise<void> {
    if (this.size < limit) return;
    
    return new Promise(resolve => {
      const checkSize = () => {
        if (this.size < limit) {
          this.off('next', checkSize);
          resolve();
        }
      };
      this.on('next', checkSize);
    });
  }

  sizeBy(filter: Partial<QueueTaskOptions>): number {
    return Array.from(this.items.values()).filter(item => {
      if (!item.options) return Object.keys(filter).length === 0;
      
      return Object.entries(filter).every(([key, value]) => {
        if (key === 'metadata') {
          // Deep comparison for metadata
          return this.matchesMetadata(item.options?.metadata, value as Record<string, unknown>);
        }
        return (item.options as any)[key] === value;
      });
    }).length;
  }

  setPriority(id: string, priority: number): void {
    const item = this.items.get(id);
    if (item && item.options) {
      item.options.priority = priority;
      // p-queue setPriority implementation will be added
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
    // p-queue cleanup will be added
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

/** Configuration options for PQueueAdapter */
export interface PQueueAdapterOptions {
  /** Maximum concurrent tasks */
  concurrency?: number;
  
  /** Rate limiting interval (ms) */
  interval?: number;
  
  /** Max tasks per interval */
  intervalCap?: number;
  
  /** Auto-start processing */
  autoStart?: boolean;
  
  /** Default task timeout */
  timeout?: number;
  
  /** Throw on timeout */
  throwOnTimeout?: boolean;
}