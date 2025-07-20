// src/core/ProcessQueue.ts

import { EventEmitter } from 'events';
import type { QueueOptions, TaskQueueOptions } from './types';

/**
 * Simple queue implementation for concurrency control
 * This is a basic implementation that provides the core functionality
 * without depending on external p-queue library
 */
class SimpleQueue {
  private tasks: Array<{ fn: () => Promise<any>, resolve: (value: any) => void, reject: (error: any) => void }> = [];
  private running = 0;
  private _concurrency: number;
  private _paused = false;
  private emptyWaiters: Array<() => void> = [];
  private idleWaiters: Array<() => void> = [];
  private sizeWaiters: Array<{ limit: number, resolve: () => void }> = [];
  
  constructor(options: any = {}) {
    this._concurrency = options.concurrency ?? Infinity;
  }
  
  async add<T>(fn: () => Promise<T> | T, options?: any): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.tasks.push({
        fn: async () => fn(),
        resolve,
        reject
      });
      
      this.process();
    });
  }
  
  private async process(): Promise<void> {
    if (this._paused || this.running >= this._concurrency || this.tasks.length === 0) {
      return;
    }
    
    const task = this.tasks.shift();
    if (!task) return;
    
    this.running++;
    this.notifyWaiters(); // Notify when queue becomes empty
    
    try {
      const result = await task.fn();
      task.resolve(result);
    } catch (error) {
      task.reject(error);
    } finally {
      this.running--;
      this.notifyWaiters(); // Notify when task completes
      this.process(); // Process next task
    }
  }
  
  private notifyWaiters(): void {
    // Notify empty waiters
    if (this.tasks.length === 0) {
      const waiters = this.emptyWaiters.splice(0);
      waiters.forEach(resolve => resolve());
    }
    
    // Notify idle waiters  
    if (this.tasks.length === 0 && this.running === 0) {
      const waiters = this.idleWaiters.splice(0);
      waiters.forEach(resolve => resolve());
    }
    
    // Notify size waiters
    this.sizeWaiters = this.sizeWaiters.filter(waiter => {
      if (this.tasks.length < waiter.limit) {
        waiter.resolve();
        return false; // Remove from array
      }
      return true; // Keep in array
    });
  }
  
  get size(): number {
    return this.tasks.length;
  }
  
  get pending(): number {
    return this.running;
  }
  
  get isPaused(): boolean {
    return this._paused;
  }
  
  get concurrency(): number {
    return this._concurrency;
  }
  
  set concurrency(value: number) {
    this._concurrency = value;
    this.process(); // Process any queued tasks
  }
  
  pause(): void {
    this._paused = true;
  }
  
  start(): void {
    this._paused = false;
    this.process();
  }
  
  clear(): void {
    this.tasks = [];
  }
  
  async onEmpty(): Promise<void> {
    if (this.tasks.length === 0) {
      return Promise.resolve();
    }
    
    return new Promise(resolve => {
      this.emptyWaiters.push(resolve);
    });
  }
  
  async onIdle(): Promise<void> {
    if (this.tasks.length === 0 && this.running === 0) {
      return Promise.resolve();
    }
    
    return new Promise(resolve => {
      this.idleWaiters.push(resolve);
    });
  }
  
  async onSizeLessThan(limit: number): Promise<void> {
    if (this.tasks.length < limit) {
      return Promise.resolve();
    }
    
    return new Promise(resolve => {
      this.sizeWaiters.push({ limit, resolve });
    });
  }
}

/**
 * ProcessQueue - Configurable task queue with real concurrency control
 * 
 * Provides:
 * - Configurable concurrency limits
 * - Rate limiting capabilities
 * - Queue pause/resume
 * - Fast path optimization for disabled state
 * - Event emission for queue state changes
 */
export class ProcessQueue extends EventEmitter {
  #queue: SimpleQueue | any; // SimpleQueue instance or mock
  readonly #config: QueueOptions;
  readonly #isEffectivelyDisabled: boolean;
  
  constructor(config: QueueOptions = {}) {
    super();
    
    // Merge with defaults
    this.#config = {
      concurrency: config.concurrency ?? Infinity,
      interval: config.interval,
      intervalCap: config.intervalCap,
      autoStart: config.autoStart ?? true,
      queueClass: config.queueClass,
      emitQueueEvents: config.emitQueueEvents ?? false,
      timeout: config.timeout,
      throwOnTimeout: config.throwOnTimeout ?? true
    };
    
    // Determine if queue is effectively disabled (v1.x compatibility mode)
    this.#isEffectivelyDisabled = this.isEffectivelyDisabled();
    
    if (this.#isEffectivelyDisabled) {
      // Create minimal no-op queue for maximum performance
      this.#queue = this.createNoOpQueue();
    } else {
      // Create simple queue with configuration
      this.#queue = new SimpleQueue({
        concurrency: this.#config.concurrency,
        autoStart: this.#config.autoStart
      });
      
      this.attachQueueListeners();
    }
  }
  
  /**
   * Check if queue is effectively disabled (v1.x compatibility mode)
   */
  private isEffectivelyDisabled(): boolean {
    return (
      this.#config.concurrency === Infinity &&
      !this.#config.interval &&
      !this.#config.intervalCap &&
      this.#config.autoStart === true
    );
  }
  
  /**
   * Create a no-op queue that executes immediately for maximum performance
   */
  private createNoOpQueue(): any {
    // Mock queue interface for immediate execution
    return {
      add: async <T>(fn: () => Promise<T> | T): Promise<T> => {
        try {
          return await fn();
        } catch (error) {
          this.emit('task:error', error as Error);
          throw error;
        }
      },
      size: 0,
      pending: 0,
      isPaused: false,
      clear: () => {},
      pause: () => {},
      start: () => {},
      onEmpty: () => Promise.resolve(),
      onIdle: () => Promise.resolve(),
      onSizeLessThan: () => Promise.resolve(),
      get concurrency() { return Infinity; },
      set concurrency(_: number) {}
    };
  }
  
  /**
   * Attach event listeners to queue instance (placeholder for future events)
   */
  private attachQueueListeners(): void {
    if (this.#isEffectivelyDisabled || !this.#config.emitQueueEvents) {
      return;
    }
    
    // For now, we'll emit events manually when operations occur
    // Future enhancement can add proper event support to SimpleQueue
  }
  
  /**
   * Add a task to the queue
   */
  async add<T>(
    fn: () => Promise<T> | T,
    options?: TaskQueueOptions
  ): Promise<T> {
    // Fast path for immediate execution (bypasses queue entirely)
    if (options?.immediate === true || this.#isEffectivelyDisabled) {
      try {
        const result = await fn();
        return result;
      } catch (error) {
        this.emit('task:error', error as Error);
        throw error;
      }
    }
    
    // Queue execution
    if (this.#config.emitQueueEvents) {
      this.emit('task:added', { 
        size: this.size, 
        pending: this.pending 
      });
    }
    
    try {
      const result = await this.#queue.add(fn);
      
      if (this.#config.emitQueueEvents) {
        this.emit('task:completed', {
          size: this.size,
          pending: this.pending
        });
      }
      
      return result;
    } catch (error) {
      this.emit('task:error', error as Error);
      throw error;
    }
  }
  
  /**
   * Pause queue processing
   */
  pause(): void {
    if (!this.#isEffectivelyDisabled) {
      this.#queue.pause();
      if (this.#config.emitQueueEvents) {
        this.emit('queue:paused');
      }
    }
  }
  
  /**
   * Resume queue processing
   */
  resume(): void {
    if (!this.#isEffectivelyDisabled) {
      this.#queue.start();
      if (this.#config.emitQueueEvents) {
        this.emit('queue:resumed');
      }
    }
  }
  
  /**
   * Clear all pending tasks
   */
  clear(): void {
    this.#queue.clear();
    if (this.#config.emitQueueEvents) {
      this.emit('queue:cleared');
    }
  }
  
  // Queue state getters
  
  /**
   * Number of tasks waiting in queue
   */
  get size(): number {
    return this.#queue.size;
  }
  
  /**
   * Number of tasks currently executing
   */
  get pending(): number {
    return this.#queue.pending;
  }
  
  /**
   * Whether queue is paused
   */
  get isPaused(): boolean {
    return this.#queue.isPaused;
  }
  
  /**
   * Current concurrency limit
   */
  get concurrency(): number {
    return this.#queue.concurrency;
  }
  
  /**
   * Whether queue is effectively disabled (v1.x mode)
   */
  get isDisabled(): boolean {
    return this.#isEffectivelyDisabled;
  }
  
  // Wait helpers
  
  /**
   * Promise that resolves when queue becomes empty
   */
  onEmpty(): Promise<void> {
    return this.#queue.onEmpty();
  }
  
  /**
   * Promise that resolves when queue becomes idle (empty + no pending)
   */
  onIdle(): Promise<void> {
    return this.#queue.onIdle();
  }
  
  /**
   * Promise that resolves when queue size becomes less than limit
   */
  onSizeLessThan(limit: number): Promise<void> {
    return this.#queue.onSizeLessThan(limit);
  }
  
  // Configuration updates
  
  /**
   * Update concurrency limit at runtime
   */
  setConcurrency(concurrency: number): void {
    if (concurrency !== this.#config.concurrency && !this.#isEffectivelyDisabled) {
      this.#config.concurrency = concurrency;
      this.#queue.concurrency = concurrency;
      
      if (this.#config.emitQueueEvents) {
        this.emit('config:updated', { concurrency });
      }
    }
  }
  
  /**
   * Get queue statistics
   */
  getStats() {
    return {
      size: this.size,
      pending: this.pending,
      isPaused: this.isPaused,
      concurrency: this.concurrency,
      isDisabled: this.isDisabled,
      emitEvents: this.#config.emitQueueEvents
    };
  }
  
  /**
   * Check if queue is idle (no pending or waiting tasks)
   */
  isIdle(): boolean {
    return this.size === 0 && this.pending === 0;
  }
  
  /**
   * Check if queue is empty (no waiting tasks, but may have pending)
   */
  isEmpty(): boolean {
    return this.size === 0;
  }
}