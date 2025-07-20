// src/core/ProcessManager.ts
import { ProcessTask, type ProcessTaskOpts } from './ProcessTask';
import type { TaskInfo, HookCallbacks, ProcessManagerOptions, QueueStats, ExitResult, QueueHealth, ShutdownOptions, TaskPredicate, TaskQueueOptions } from './types';
import { HookManager } from './HookManager';
import { ProcessQueue } from './ProcessQueue';
import { TaskHandle } from './TaskHandle';
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
      
      this.#queue.on('queue:cleared', () => {
        this.emit('queue:cleared');
      });
      
      this.#queue.on('task:added', (data) => {
        this.emit('queue:add', data);
      });
      
      this.#queue.on('task:completed', (data) => {
        this.emit('queue:completed', data);
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
    this.#totalAdded++;
    
    // Determine execution path
    if (this.shouldRunImmediately(opts)) {
      // Fast path: immediate execution (v1.x compatibility)
      const task = new ProcessTask(enhancedOpts);
      this.#tasks.set(task.info.id, task);
      this.trackTaskStatistics(task);
      return task.info;
    } else {
      // Queue path: create task with delayed start
      const delayedOpts = { ...enhancedOpts, delayStart: true };
      const task = new ProcessTask(delayedOpts);
      this.#tasks.set(task.info.id, task);
      
      const queueTime = Date.now();
      
      // Prepare queue options with task ID for priority management
      const queueId = opts.queue?.id || task.info.id;
      const queueOptions = {
        ...opts.queue,
        id: queueId // Use provided ID or fall back to task ID
      };
      
      // Store the queue ID in task metadata for priority management
      if (!task.info.metadata) {
        task.info.metadata = {};
      }
      task.info.metadata.queueId = queueId;

      this.#queue.add(
        async () => {
          // Actually start the process when queue allows it
          if (task.info.status === 'queued') {
            const waitTime = Date.now() - queueTime;
            this.#waitTimes.push(waitTime);
            
            task.startDelayedProcess(enhancedOpts);
            this.trackTaskStatistics(task);
            
            // Wait for the process to complete
            return new Promise<void>((resolve) => {
              const cleanup = () => {
                task.off('exit', onExit);
                task.off('start-failed', onExit);
              };
              
              const onExit = () => {
                cleanup();
                resolve();
              };
              
              task.on('exit', onExit);
              task.on('start-failed', onExit);
            });
          }
          return Promise.resolve();
        },
        queueOptions
      ).catch(error => {
        // Handle queue errors
        task.info.status = 'start-failed';
        task.info.startError = error;
        this.#totalFailed++;
      });
      
      return task.info;
    }
  }

  private trackTaskStatistics(task: ProcessTask): void {
    task.on('exit', () => {
      const duration = task.info.exitedAt! - task.info.startedAt;
      this.#runTimes.push(duration);
      
      if (task.info.status === 'exited' && task.info.exitCode === 0) {
        this.#totalCompleted++;
      } else {
        this.#totalFailed++;
      }
      
      this.emit('queue:stats', this.getQueueStats());
    });
    
    task.on('start-failed', () => {
      this.#totalFailed++;
      this.emit('queue:stats', this.getQueueStats());
    });
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
      
      // Prepare queue options with task ID for priority management
      const queueId = opts.queue?.id || task.info.id;
      const queueOptions = {
        ...opts.queue,
        id: queueId // Use provided ID or fall back to task ID
      };
      
      // Store the queue ID in task metadata for priority management
      if (!task.info.metadata) {
        task.info.metadata = {};
      }
      task.info.metadata.queueId = queueId;

      await this.#queue.add(
        async () => {
          if (task.info.status === 'queued') {
            task.startDelayedProcess(enhancedOpts);
            
            // Wait for the process to complete
            return new Promise<void>((resolve) => {
              const cleanup = () => {
                task.off('exit', onExit);
                task.off('start-failed', onExit);
              };
              
              const onExit = () => {
                cleanup();
                resolve();
              };
              
              task.on('exit', onExit);
              task.on('start-failed', onExit);
            });
          }
          return Promise.resolve();
        },
        queueOptions
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
  
  // Enhanced statistics tracking
  #totalAdded = 0;
  #totalCompleted = 0;
  #totalFailed = 0;
  #totalCancelled = 0;
  #waitTimes: number[] = [];
  #runTimes: number[] = [];
  #queueStartTime = Date.now();

  getQueueStats(): QueueStats {
    const stats = this.#queue.getStats();
    const now = Date.now();
    const uptime = now - this.#queueStartTime;
    
    const avgWaitTime = this.#waitTimes.length > 0 
      ? this.#waitTimes.reduce((a, b) => a + b, 0) / this.#waitTimes.length 
      : 0;
    
    const avgRunTime = this.#runTimes.length > 0 
      ? this.#runTimes.reduce((a, b) => a + b, 0) / this.#runTimes.length 
      : 0;
    
    const throughput = uptime > 0 ? (this.#totalCompleted / (uptime / 1000)) : 0;
    const utilization = this.getQueueConcurrency() > 0 
      ? (stats.pending / this.getQueueConcurrency()) * 100 
      : 0;

    return {
      size: stats.size,
      pending: stats.pending,
      paused: stats.isPaused,
      totalAdded: this.#totalAdded,
      totalCompleted: this.#totalCompleted,
      totalFailed: this.#totalFailed,
      totalCancelled: this.#totalCancelled,
      averageWaitTime: avgWaitTime,
      averageRunTime: avgRunTime,
      throughput,
      utilization: Math.min(utilization, 100)
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
  
  // Enhanced async methods
  
  async startAndWait(opts: ProcessTaskOpts): Promise<ExitResult> {
    const taskInfo = await this.startAsync(opts);
    return this.waitForTask(taskInfo.id);
  }
  
  async waitForTask(taskId: string): Promise<ExitResult> {
    const task = this.#tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    return new Promise((resolve, reject) => {
      // If already completed, resolve immediately
      if (task.info.status === 'exited' || 
          task.info.status === 'killed' || 
          task.info.status === 'timeout') {
        resolve(this.createExitResult(task));
        return;
      }
      
      // If failed to start, reject
      if (task.info.status === 'start-failed') {
        reject(task.info.startError || new Error('Task failed to start'));
        return;
      }
      
      // Wait for completion
      const cleanup = () => {
        task.off('exit', onExit);
        task.off('start-failed', onError);
      };
      
      const onExit = () => {
        cleanup();
        resolve(this.createExitResult(task));
      };
      
      const onError = () => {
        cleanup();
        reject(task.info.startError || new Error('Task failed'));
      };
      
      task.on('exit', onExit);
      task.on('start-failed', onError);
    });
  }
  
  async waitForAll(taskIds?: string[]): Promise<ExitResult[]> {
    const ids = taskIds || Array.from(this.#tasks.keys());
    const promises = ids.map(id => this.waitForTask(id));
    return Promise.allSettled(promises).then(results => {
      const exitResults: ExitResult[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') {
          exitResults.push(result.value);
        } else {
          // Create error result for failed tasks
          const task = this.#tasks.get(ids[results.indexOf(result)]!);
          if (task) {
            exitResults.push({
              taskInfo: task.info,
              exitCode: -1,
              signal: null,
              duration: (task.info.exitedAt ?? Date.now()) - task.info.startedAt,
              stdout: '',
              stderr: result.reason?.message || 'Task failed'
            });
          }
        }
      }
      return exitResults;
    });
  }
  
  // Batch operations
  
  startAll(optsList: ProcessTaskOpts[]): TaskInfo[] {
    return optsList.map(opts => this.start(opts));
  }
  
  async startAllAsync(optsList: ProcessTaskOpts[]): Promise<TaskInfo[]> {
    const promises = optsList.map(opts => this.startAsync(opts));
    return Promise.all(promises);
  }
  
  private createExitResult(task: ProcessTask): ExitResult {
    const duration = task.info.exitedAt 
      ? task.info.exitedAt - task.info.startedAt
      : Date.now() - task.info.startedAt;
      
    return {
      taskInfo: { ...task.info },
      exitCode: task.info.exitCode ?? null,
      signal: null, // TODO: Track signal if killed
      duration,
      stdout: this.getTaskOutput(task.info.id, 'stdout'),
      stderr: this.getTaskOutput(task.info.id, 'stderr')
    };
  }
  
  private getTaskOutput(taskId: string, _stream: 'stdout' | 'stderr'): string {
    // For now, we'll read from the combined log file
    // In a real implementation, we might want to separate stdout/stderr
    try {
      const task = this.#tasks.get(taskId);
      const logPath = task?.info.logFile;
      if (logPath && require('fs').existsSync(logPath)) {
        return require('fs').readFileSync(logPath, 'utf-8');
      }
    } catch (error) {
      // Log file not available
    }
    return '';
  }
  
  // TaskHandle-related methods
  
  startWithHandle(opts: ProcessTaskOpts): TaskHandle {
    const enhancedOpts = this.enhanceOptions(opts);
    
    if (this.shouldRunImmediately(opts)) {
      // Fast path: immediate execution
      const task = new ProcessTask(enhancedOpts);
      this.#tasks.set(task.info.id, task);
      return new TaskHandle(task, this);
    } else {
      // Queue path: create task with delayed start
      const delayedOpts = { ...enhancedOpts, delayStart: true };
      const task = new ProcessTask(delayedOpts);
      this.#tasks.set(task.info.id, task);
      
      // Prepare queue options with task ID for priority management
      const queueId = opts.queue?.id || task.info.id;
      const queueOptions = {
        ...opts.queue,
        id: queueId // Use provided ID or fall back to task ID
      };
      
      // Store the queue ID in task metadata for priority management
      if (!task.info.metadata) {
        task.info.metadata = {};
      }
      task.info.metadata.queueId = queueId;

      this.#queue.add(
        async () => {
          if (task.info.status === 'queued') {
            task.startDelayedProcess(enhancedOpts);
            
            // Wait for the process to complete
            return new Promise<void>((resolve) => {
              const cleanup = () => {
                task.off('exit', onExit);
                task.off('start-failed', onExit);
              };
              
              const onExit = () => {
                cleanup();
                resolve();
              };
              
              task.on('exit', onExit);
              task.on('start-failed', onExit);
            });
          }
          return Promise.resolve();
        },
        queueOptions
      ).catch(error => {
        // Handle queue errors
        task.info.status = 'start-failed';
        task.info.startError = error;
      });
      
      return new TaskHandle(task, this);
    }
  }
  
  async startAsyncWithHandle(opts: ProcessTaskOpts): Promise<TaskHandle> {
    const enhancedOpts = this.enhanceOptions(opts);
    
    if (this.shouldRunImmediately(opts)) {
      // Immediate execution
      const task = new ProcessTask(enhancedOpts);
      this.#tasks.set(task.info.id, task);
      return new TaskHandle(task, this);
    } else {
      // Queue execution with await
      const delayedOpts = { ...enhancedOpts, delayStart: true };
      const task = new ProcessTask(delayedOpts);
      this.#tasks.set(task.info.id, task);
      
      // Prepare queue options with task ID for priority management
      const queueId = opts.queue?.id || task.info.id;
      const queueOptions = {
        ...opts.queue,
        id: queueId // Use provided ID or fall back to task ID
      };
      
      // Store the queue ID in task metadata for priority management
      if (!task.info.metadata) {
        task.info.metadata = {};
      }
      task.info.metadata.queueId = queueId;

      await this.#queue.add(
        async () => {
          if (task.info.status === 'queued') {
            task.startDelayedProcess(enhancedOpts);
            
            // Wait for the process to complete
            return new Promise<void>((resolve) => {
              const cleanup = () => {
                task.off('exit', onExit);
                task.off('start-failed', onExit);
              };
              
              const onExit = () => {
                cleanup();
                resolve();
              };
              
              task.on('exit', onExit);
              task.on('start-failed', onExit);
            });
          }
          return Promise.resolve();
        },
        queueOptions
      );
      
      return new TaskHandle(task, this);
    }
  }
  
  getTaskHandle(taskId: string): TaskHandle | undefined {
    const task = this.#tasks.get(taskId);
    return task ? new TaskHandle(task, this) : undefined;
  }
  
  // Advanced task management methods for Task 010
  
  async cancelTasks(predicate: (task: TaskInfo) => boolean): Promise<string[]> {
    const cancelledIds: string[] = [];
    
    for (const [taskId, task] of this.#tasks) {
      if (predicate(task.info)) {
        if (task.info.status === 'queued') {
          // Cancel queued task
          task.info.status = 'start-failed';
          task.info.startError = new Error('Task was cancelled');
          task.emit('start-failed', task.info.startError);
          this.#totalCancelled++;
          cancelledIds.push(taskId);
          this.emit('task:cancelled', task.info);
        } else if (task.info.status === 'running') {
          // Kill running task
          task.terminate();
          this.#totalCancelled++;
          cancelledIds.push(taskId);
          this.emit('task:cancelled', task.info);
        }
      }
    }
    
    return cancelledIds;
  }
  
  reprioritizeTask(taskId: string, priority: number): boolean {
    const task = this.#tasks.get(taskId);
    if (!task || task.info.status !== 'queued') {
      return false;
    }
    
    // Update task metadata if it exists
    if (!task.info.metadata) {
      task.info.metadata = {};
    }
    task.info.metadata.priority = priority;
    
    // The queue ID might be different from the task ID if a custom ID was provided
    // Try to get the queue ID from metadata, fall back to task ID
    const queueId = task.info.metadata.queueId as string || taskId;
    
    // Try to update priority in queue via ProcessQueue
    const success = this.#queue.setPriority(queueId, priority);
    
    if (success && this.#queue.getStats().emitEvents) {
      this.emit('task:priority-updated', { taskId, priority, taskInfo: task.info });
    }
    
    return success;
  }
  
  getQueuedTasks(): TaskInfo[] {
    return [...this.#tasks.values()]
      .filter(t => t.info.status === 'queued')
      .map(t => t.info);
  }
  
  getRunningTasks(): TaskInfo[] {
    return this.listRunning();
  }
  
  async waitForAvailableSlot(): Promise<void> {
    const concurrency = this.getQueueConcurrency();
    if (concurrency === Infinity) {
      return; // No limit, always available
    }
    
    while (this.#queue.getStats().pending >= concurrency) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  setConcurrency(limit: number): void {
    this.setQueueConcurrency(limit);
  }
  
  setRateLimit(interval: number, cap: number): void {
    // Update queue rate limiting if supported
    this.#queue.setRateLimit(interval, cap);
  }
  
  getHealth(): QueueHealth {
    const stats = this.getQueueStats();
    const memoryUsage = process.memoryUsage().heapUsed;
    const issues: string[] = [];
    
    // Check for potential issues
    if (stats.utilization > 90) {
      issues.push('High queue utilization');
    }
    
    if (stats.averageWaitTime > 30000) { // 30 seconds
      issues.push('High average wait time');
    }
    
    if (memoryUsage > 500 * 1024 * 1024) { // 500MB
      issues.push('High memory usage');
    }
    
    if (stats.totalFailed / Math.max(stats.totalAdded, 1) > 0.1) { // 10% failure rate
      issues.push('High failure rate');
    }
    
    const status = issues.length === 0 ? 'healthy' : 
                   issues.length <= 2 ? 'degraded' : 'unhealthy';
    
    return {
      status,
      issues,
      memoryUsage,
      processingRate: stats.throughput,
      averageWaitTimeWindow: stats.averageWaitTime,
      lastCheck: Date.now()
    };
  }
  
  async shutdown(options: ShutdownOptions = {}): Promise<void> {
    const { timeout = 30000, force = false, cancelPending = true } = options;
    
    if (cancelPending) {
      this.clearQueue();
    } else {
      this.pauseQueue();
    }
    
    const runningTasks = this.getRunningTasks();
    if (runningTasks.length === 0) {
      return;
    }
    
    // Wait for tasks to complete or timeout
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => resolve(), timeout);
    });
    
    const completionPromise = Promise.all(
      runningTasks.map(task => this.waitForTask(task.id).catch(() => {}))
    ).then(() => {});
    
    await Promise.race([completionPromise, timeoutPromise]);
    
    // Force kill remaining tasks if requested
    if (force) {
      const stillRunning = this.getRunningTasks();
      for (const task of stillRunning) {
        this.kill(task.id, 'SIGKILL');
      }
    }
  }

  // Priority management methods for Task 011
  
  /**
   * Get tasks sorted by priority (highest first)
   */
  getTasksByPriority(): Array<{ id?: string, priority: number, queuedAt: number }> {
    return this.#queue.getTasksByPriority();
  }
  
  /**
   * Calculate current effective priority for given options (including aging)
   */
  calculateEffectivePriority(options: TaskQueueOptions): number {
    return this.#queue.calculateCurrentPriority(options);
  }
  
  /**
   * Get priority statistics for the queue
   */
  getPriorityStats(): { highPriority: number, normal: number, lowPriority: number } {
    const tasks = this.getTasksByPriority();
    
    return {
      highPriority: tasks.filter(t => t.priority > 0).length,
      normal: tasks.filter(t => t.priority === 0).length,
      lowPriority: tasks.filter(t => t.priority < 0).length
    };
  }

  cancelTask(taskId: string): boolean {
    const task = this.#tasks.get(taskId);
    if (!task || task.info.status !== 'queued') {
      return false;
    }
    
    // Mark as cancelled and remove from internal tracking
    task.info.status = 'start-failed';
    task.info.startError = new Error('Task was cancelled');
    task.emit('start-failed', task.info.startError);
    this.#totalCancelled++;
    this.emit('task:cancelled', task.info);
    
    // Note: We can't easily remove from queue without queue task IDs
    // For now, the task will remain in queue but won't start due to status check
    return true;
  }
}
