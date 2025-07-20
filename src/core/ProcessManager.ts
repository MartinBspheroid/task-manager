// src/core/ProcessManager.ts
import { ProcessTask, type ProcessTaskOpts } from './ProcessTask';
import type { TaskInfo, HookCallbacks, ProcessManagerOptions, QueueStats, TaskQueueOptions } from './types';
import { HookManager } from './HookManager';
import { ProcessQueue } from './ProcessQueue';
import { EventEmitter } from 'events';

export class ProcessManager extends EventEmitter {
  readonly #tasks = new Map<string, ProcessTask>();
  readonly #queue: ProcessQueue;
  readonly #hookManager = new HookManager();
  #globalHooks: HookCallbacks = {};
  #defaultLogDir?: string;

  constructor(options: ProcessManagerOptions = {}) {
    super();
    this.#defaultLogDir = options.defaultLogDir;
    this.#queue = new ProcessQueue(options.queue);
    
    if (options.hooks) {
      this.#globalHooks = options.hooks;
    }
    
    // Forward queue events if enabled
    this.setupQueueEventForwarding();
  }
  
  private setupQueueEventForwarding(): void {
    // Only forward events if queue events are enabled and queue is not disabled
    if (!this.#queue.isDisabled && this.#queue.getStats().emitEvents) {
      this.#queue.on('queue:idle', () => {
        this.emit('queue:idle');
      });
      
      this.#queue.on('task:error', (error) => {
        this.emit('task:error', error);
      });
      
      this.#queue.on('queue:paused', () => {
        this.emit('queue:paused');
      });
      
      this.#queue.on('queue:resumed', () => {
        this.emit('queue:resumed');
      });
    }
  }
  
  private enhanceOptions(opts: ProcessTaskOpts): ProcessTaskOpts {
    // Merge global hooks with task-specific hooks
    const mergedHooks = this.#hookManager.mergeHooks(this.#globalHooks, opts.hooks);
    
    // Use default log dir if not specified
    const logDir = opts.logDir ?? this.#defaultLogDir ?? 'logs';
    
    return { 
      ...opts, 
      logDir,
      hooks: mergedHooks, 
      hookManager: this.#hookManager 
    };
  }
  
  private shouldRunImmediately(opts: ProcessTaskOpts): boolean {
    return (
      this.#queue.isDisabled ||
      opts.queue?.immediate === true
    );
  }
  
  start(opts: ProcessTaskOpts): TaskInfo {
    const enhancedOpts = this.enhanceOptions(opts);
    
    // Determine execution path
    if (this.shouldRunImmediately(opts)) {
      // Fast path: immediate execution (v1.x compatibility)
      const task = new ProcessTask(enhancedOpts);
      this.#tasks.set(task.info.id, task);
      return task.info;
    } else {
      // Queue path: create task with delayed start
      const delayedOpts = { ...enhancedOpts, delayStart: true };
      const task = new ProcessTask(delayedOpts);
      this.#tasks.set(task.info.id, task);
      
      this.#queue.add(
        async () => {
          // Actually start the process when queue allows it
          if (task.info.status === 'queued') {
            task.startDelayedProcess(enhancedOpts);
            
            // Wait for the process to complete
            return new Promise<void>((resolve, reject) => {
              const cleanup = () => {
                task.off('exited', onExit);
                task.off('killed', onExit);
                task.off('timeout', onExit);
                task.off('start-failed', onExit);
              };
              
              const onExit = () => {
                cleanup();
                resolve();
              };
              
              task.on('exited', onExit);
              task.on('killed', onExit);
              task.on('timeout', onExit);
              task.on('start-failed', onExit);
            });
          }
          return Promise.resolve();
        },
        opts.queue
      ).catch(error => {
        // Handle queue errors
        task.info.status = 'start-failed';
        task.info.startError = error;
      });
      
      return task.info;
    }
  }

  list(): TaskInfo[] {
    return [...this.#tasks.values()].map((t) => t.info);
  }

  listRunning(): TaskInfo[] {
    return [...this.#tasks.values()]
      .filter((t) => t.info.status === 'running')
      .map((t) => t.info);
  }

  kill(id: string, signal?: NodeJS.Signals) {
    const task = this.#tasks.get(id);
    if (!task) throw new Error(`task ${id} not found`);
    task.terminate(signal);
  }

  write(id: string, input: string) {
    const task = this.#tasks.get(id);
    if (!task) throw new Error(`task ${id} not found`);
    task.write(input);
  }

  killAll(signal?: NodeJS.Signals): string[] {
    const killedIds: string[] = [];
    for (const task of this.#tasks.values()) {
      if (task.info.status === 'running') {
        task.terminate(signal);
        killedIds.push(task.info.id);
      }
    }
    return killedIds;
  }

  killByTag(tag: string, signal?: NodeJS.Signals): string[] {
    const killedIds: string[] = [];
    for (const task of this.#tasks.values()) {
      if (task.info.status === 'running' && task.info.tags?.includes(tag)) {
        task.terminate(signal);
        killedIds.push(task.info.id);
      }
    }
    return killedIds;
  }

  registerGlobalHooks(hooks: HookCallbacks): void {
    this.#globalHooks = this.#hookManager.mergeHooks(this.#globalHooks, hooks);
  }

  clearGlobalHooks(): void {
    this.#globalHooks = {};
  }

  getGlobalHooks(): HookCallbacks {
    return { ...this.#globalHooks };
  }
  
  /**
   * Start a task immediately, bypassing any queue settings
   * This is a convenience method that ensures immediate execution
   */
  startImmediate(opts: ProcessTaskOpts): TaskInfo {
    // Force immediate execution by adding immediate flag
    const immediateOpts: ProcessTaskOpts = {
      ...opts,
      queue: { ...opts.queue, immediate: true }
    };
    return this.start(immediateOpts);
  }
  
  // New async variant for queue-aware code
  async startAsync(opts: ProcessTaskOpts): Promise<TaskInfo> {
    const enhancedOpts = this.enhanceOptions(opts);
    
    if (this.shouldRunImmediately(opts)) {
      // Immediate execution
      const task = new ProcessTask(enhancedOpts);
      this.#tasks.set(task.info.id, task);
      return task.info;
    } else {
      // Queue execution with await
      const delayedOpts = { ...enhancedOpts, delayStart: true };
      const task = new ProcessTask(delayedOpts);
      this.#tasks.set(task.info.id, task);
      
      await this.#queue.add(
        async () => {
          if (task.info.status === 'queued') {
            task.startDelayedProcess(enhancedOpts);
            
            // Wait for the process to complete
            return new Promise<void>((resolve, reject) => {
              const cleanup = () => {
                task.off('exited', onExit);
                task.off('killed', onExit);
                task.off('timeout', onExit);
                task.off('start-failed', onExit);
              };
              
              const onExit = () => {
                cleanup();
                resolve();
              };
              
              task.on('exited', onExit);
              task.on('killed', onExit);
              task.on('timeout', onExit);
              task.on('start-failed', onExit);
            });
          }
          return Promise.resolve();
        },
        opts.queue
      );
      
      return task.info;
    }
  }
  
  // Queue management methods
  setQueueConcurrency(concurrency: number): void {
    this.#queue.setConcurrency(concurrency);
  }
  
  pauseQueue(): void {
    this.#queue.pause();
  }
  
  resumeQueue(): void {
    this.#queue.resume();
  }
  
  clearQueue(): void {
    this.#queue.clear();
  }
  
  getQueueStats(): QueueStats {
    const stats = this.#queue.getStats();
    return {
      size: stats.size,
      pending: stats.pending,
      paused: stats.isPaused,
      totalAdded: 0, // TODO: Track this
      totalCompleted: 0 // TODO: Track this
    };
  }
  
  // Wait for queue conditions
  async waitForQueueIdle(): Promise<void> {
    return this.#queue.onIdle();
  }
  
  async waitForQueueEmpty(): Promise<void> {
    return this.#queue.onEmpty();
  }
  
  async waitForQueueSizeLessThan(limit: number): Promise<void> {
    return this.#queue.onSizeLessThan(limit);
  }
  
  // Feature detection
  get supportsQueue(): boolean {
    return true;
  }
  
  isQueuingEnabled(): boolean {
    return !this.#queue.isDisabled;
  }
  
  getQueueConcurrency(): number {
    return this.#queue.concurrency;
  }
  
  isQueuePaused(): boolean {
    return this.#queue.isPaused;
  }
  
  isQueueIdle(): boolean {
    return this.#queue.isIdle();
  }
  
  isQueueEmpty(): boolean {
    return this.#queue.isEmpty();
  }
}
