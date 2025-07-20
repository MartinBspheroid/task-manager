// src/core/interfaces/IQueue.ts

import { EventEmitter } from 'events';

/** Core queue interface for managing task execution */
export interface IQueue<T = unknown> extends EventEmitter {
  /** Add task to queue */
  add<R>(
    fn: (context?: QueueContext) => Promise<R> | R,
    options?: QueueTaskOptions
  ): Promise<R>;
  
  /** Add multiple tasks */
  addAll<R>(
    fns: Array<(context?: QueueContext) => Promise<R> | R>,
    options?: QueueTaskOptions
  ): Promise<R[]>;
  
  /** Queue control */
  pause(): void;
  resume(): void;
  clear(): void;
  
  /** Queue state */
  readonly size: number;
  readonly pending: number;
  readonly isPaused: boolean;
  
  /** Wait for conditions */
  onEmpty(): Promise<void>;
  onIdle(): Promise<void>;
  onSizeLessThan(limit: number): Promise<void>;
  
  /** Advanced queue operations */
  sizeBy(filter: Partial<QueueTaskOptions>): number;
  setPriority(id: string, priority: number): void;
  
  /** Events (typed overloads for EventEmitter) */
  on(event: 'add', listener: (item: QueueItem<T>) => void): this;
  on(event: 'start', listener: (item: QueueItem<T>) => void): this;
  on(event: 'active', listener: (item: QueueItem<T>) => void): this;
  on(event: 'complete', listener: (item: QueueItem<T>, result: unknown) => void): this;
  on(event: 'error', listener: (error: Error, item: QueueItem<T>) => void): this;
  on(event: 'idle', listener: () => void): this;
  on(event: 'empty', listener: () => void): this;
  on(event: 'next', listener: () => void): this;
  
  /** Lifecycle */
  destroy(): Promise<void>;
}

/** Options for individual queue tasks */
export interface QueueTaskOptions {
  /** Task priority (higher numbers run first) */
  priority?: number;
  
  /** AbortSignal for task cancellation */
  signal?: AbortSignal;
  
  /** Task metadata for filtering and identification */
  metadata?: Record<string, unknown>;
  
  /** Unique identifier for priority adjustments */
  id?: string;
  
  /** Custom timeout for this task */
  timeout?: number;
}

/** Context passed to queue task functions */
export interface QueueContext {
  /** AbortSignal for task cancellation */
  signal?: AbortSignal;
  
  /** Task metadata */
  metadata?: Record<string, unknown>;
  
  /** Task ID if provided */
  id?: string;
}

/** Internal queue item representation */
export interface QueueItem<T = unknown> {
  /** Unique identifier */
  id: string;
  
  /** Task function to execute */
  fn: (context?: QueueContext) => Promise<T> | T;
  
  /** Task options */
  options?: QueueTaskOptions;
  
  /** Timestamp when added to queue */
  addedAt: number;
  
  /** Timestamp when task started executing */
  startedAt?: number;
  
  /** Timestamp when task completed */
  completedAt?: number;
}

/** Queue statistics */
export interface QueueStats {
  /** Number of tasks waiting in queue */
  size: number;
  
  /** Number of running tasks */
  pending: number;
  
  /** Whether queue is paused */
  paused: boolean;
  
  /** Total tasks added since creation */
  totalAdded: number;
  
  /** Total tasks completed since creation */
  totalCompleted: number;
  
  /** Total tasks that failed since creation */
  totalFailed: number;
}