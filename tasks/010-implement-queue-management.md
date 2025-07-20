# Task 010: Implement Queue Management Methods

## Objective

Provide comprehensive queue management capabilities including monitoring, control, and introspection to enable sophisticated process orchestration.

## Background

A production-ready queue system needs:
- Real-time queue monitoring
- Pause/resume capabilities  
- Selective task management
- Statistics and health monitoring
- Event-driven notifications
- Graceful shutdown support

## Design

### 1. Queue Management Interface

```typescript
interface QueueManager {
  // Control operations
  pause(): void;
  resume(): void;
  clear(): void;
  
  // Task management
  cancelTask(taskId: string): boolean;
  cancelTasks(predicate: (info: TaskInfo) => boolean): string[];
  reprioritizeTask(taskId: string, priority: number): boolean;
  
  // Monitoring
  getStats(): QueueStats;
  getQueuedTasks(): TaskInfo[];
  getRunningTasks(): TaskInfo[];
  
  // Wait operations
  waitForIdle(): Promise<void>;
  waitForQueueSize(size: number): Promise<void>;
  waitForAvailableSlot(): Promise<void>;
  
  // Configuration
  setConcurrency(concurrency: number): void;
  setRateLimit(interval: number, cap: number): void;
  
  // Health and lifecycle
  getHealth(): QueueHealth;
  shutdown(options?: ShutdownOptions): Promise<void>;
}

interface QueueStats {
  // Current state
  size: number;           // Tasks waiting
  pending: number;        // Tasks running
  completed: number;      // Tasks finished today
  failed: number;         // Tasks failed today
  
  // Capacity
  concurrency: number;    // Max concurrent
  utilization: number;    // pending / concurrency
  
  // Performance
  averageWaitTime: number;
  averageRunTime: number;
  throughput: number;     // tasks/minute
  
  // Rate limiting
  intervalRemaining?: number;
  intervalResetTime?: number;
}

interface QueueHealth {
  status: 'healthy' | 'degraded' | 'critical';
  issues: string[];
  uptime: number;
  memoryUsage: number;
}
```

### 2. Enhanced ProcessManager

```typescript
// src/core/ProcessManager.ts

export class ProcessManager extends EventEmitter {
  readonly #queueManager: QueueManager;
  readonly #stats: QueueStatsCollector;
  
  constructor(options: ProcessManagerOptions = {}) {
    super();
    this.#queue = new ProcessQueue(options.queue);
    this.#queueManager = new QueueManagerImpl(this.#queue, this);
    this.#stats = new QueueStatsCollector();
    
    this.setupEventForwarding();
  }
  
  // Queue control methods
  pauseQueue(): void {
    this.#queueManager.pause();
    this.emit('queue:paused');
  }
  
  resumeQueue(): void {
    this.#queueManager.resume();
    this.emit('queue:resumed');
  }
  
  clearQueue(): string[] {
    const cancelledIds = this.getQueuedTasks().map(t => t.id);
    this.#queueManager.clear();
    this.emit('queue:cleared', { cancelledIds });
    return cancelledIds;
  }
  
  // Task management
  cancelTask(taskId: string): boolean {
    const task = this.#tasks.get(taskId);
    if (!task) return false;
    
    if (task.info.status === 'queued') {
      // Remove from queue
      const success = this.#queueManager.cancelTask(taskId);
      if (success) {
        task.info.status = 'cancelled';
        task.info.exitedAt = Date.now();
        task.emit('cancelled', task.info);
        this.emit('task:cancelled', task.info);
      }
      return success;
    } else if (task.info.status === 'running') {
      // Kill running process
      return this.kill(taskId);
    }
    
    return false;
  }
  
  cancelTasks(predicate: (info: TaskInfo) => boolean): string[] {
    const toCancel = this.list().filter(predicate);
    const cancelled: string[] = [];
    
    for (const task of toCancel) {
      if (this.cancelTask(task.id)) {
        cancelled.push(task.id);
      }
    }
    
    return cancelled;
  }
  
  reprioritizeTask(taskId: string, priority: number): boolean {
    return this.#queueManager.reprioritizeTask(taskId, priority);
  }
  
  // Monitoring
  getQueueStats(): QueueStats {
    return this.#queueManager.getStats();
  }
  
  getQueuedTasks(): TaskInfo[] {
    return this.list().filter(t => t.status === 'queued');
  }
  
  getRunningTasks(): TaskInfo[] {
    return this.list().filter(t => t.status === 'running');
  }
  
  // Wait operations
  async waitForQueueIdle(): Promise<void> {
    return this.#queueManager.waitForIdle();
  }
  
  async waitForAvailableSlot(): Promise<void> {
    return this.#queueManager.waitForAvailableSlot();
  }
  
  async waitForQueueSize(size: number): Promise<void> {
    return this.#queueManager.waitForQueueSize(size);
  }
  
  // Configuration updates
  setConcurrency(concurrency: number): void {
    this.#queueManager.setConcurrency(concurrency);
    this.emit('queue:config-changed', { concurrency });
  }
  
  setRateLimit(interval: number, cap: number): void {
    this.#queueManager.setRateLimit(interval, cap);
    this.emit('queue:config-changed', { interval, cap });
  }
  
  // Health monitoring
  getQueueHealth(): QueueHealth {
    return this.#queueManager.getHealth();
  }
  
  // Graceful shutdown
  async shutdown(options?: ShutdownOptions): Promise<void> {
    return this.#queueManager.shutdown(options);
  }
}
```

### 3. QueueManager Implementation

```typescript
// src/core/QueueManagerImpl.ts

interface ShutdownOptions {
  /** Max time to wait for tasks to complete */
  timeout?: number;
  
  /** Force kill tasks after timeout */
  force?: boolean;
  
  /** Stop accepting new tasks */
  stopAccepting?: boolean;
}

export class QueueManagerImpl implements QueueManager {
  readonly #queue: ProcessQueue;
  readonly #processManager: ProcessManager;
  readonly #stats = new Map<string, TaskStats>();
  readonly #startTime = Date.now();
  
  constructor(queue: ProcessQueue, processManager: ProcessManager) {
    this.#queue = queue;
    this.#processManager = processManager;
    this.setupStatsCollection();
  }
  
  private setupStatsCollection(): void {
    this.#processManager.on('task:started', (info) => {
      this.#stats.set(info.id, {
        queuedAt: info.queuedAt || info.startedAt,
        startedAt: info.startedAt,
        waitTime: info.startedAt - (info.queuedAt || info.startedAt)
      });
    });
    
    this.#processManager.on('task:completed', (info) => {
      const stats = this.#stats.get(info.id);
      if (stats) {
        stats.completedAt = info.exitedAt;
        stats.runTime = info.exitedAt! - info.startedAt;
      }
    });
  }
  
  pause(): void {
    this.#queue.pause();
  }
  
  resume(): void {
    this.#queue.resume();
  }
  
  clear(): void {
    this.#queue.clear();
  }
  
  cancelTask(taskId: string): boolean {
    return this.#queue.remove(taskId);
  }
  
  cancelTasks(predicate: (info: TaskInfo) => boolean): string[] {
    const queuedTasks = this.#processManager.getQueuedTasks();
    const toCancel = queuedTasks.filter(predicate);
    
    return toCancel
      .map(task => task.id)
      .filter(id => this.cancelTask(id));
  }
  
  reprioritizeTask(taskId: string, priority: number): boolean {
    return this.#queue.setPriority(taskId, priority);
  }
  
  getStats(): QueueStats {
    const queueStats = this.#queue.getStats();
    const tasks = Array.from(this.#stats.values());
    const now = Date.now();
    const dayStart = now - (24 * 60 * 60 * 1000);
    
    const recentTasks = tasks.filter(t => 
      (t.startedAt || t.queuedAt) > dayStart
    );
    
    const completed = recentTasks.filter(t => t.completedAt).length;
    const failed = this.#processManager.list()
      .filter(t => t.status === 'start-failed' && t.startedAt > dayStart)
      .length;
    
    const waitTimes = recentTasks.map(t => t.waitTime).filter(Boolean);
    const runTimes = recentTasks.map(t => t.runTime).filter(Boolean);
    
    return {
      size: queueStats.size,
      pending: queueStats.pending,
      completed,
      failed,
      concurrency: queueStats.concurrency,
      utilization: queueStats.pending / queueStats.concurrency,
      averageWaitTime: this.average(waitTimes),
      averageRunTime: this.average(runTimes),
      throughput: this.calculateThroughput(recentTasks),
      intervalRemaining: queueStats.intervalRemaining,
      intervalResetTime: queueStats.intervalResetTime
    };
  }
  
  getQueuedTasks(): TaskInfo[] {
    return this.#processManager.getQueuedTasks();
  }
  
  getRunningTasks(): TaskInfo[] {
    return this.#processManager.getRunningTasks();
  }
  
  async waitForIdle(): Promise<void> {
    return this.#queue.onIdle();
  }
  
  async waitForQueueSize(size: number): Promise<void> {
    return this.#queue.onSizeLessThan(size + 1);
  }
  
  async waitForAvailableSlot(): Promise<void> {
    const stats = this.getStats();
    if (stats.utilization < 1) return;
    
    return new Promise<void>((resolve) => {
      const checkSlot = () => {
        const currentStats = this.getStats();
        if (currentStats.utilization < 1) {
          resolve();
        } else {
          setTimeout(checkSlot, 100);
        }
      };
      checkSlot();
    });
  }
  
  setConcurrency(concurrency: number): void {
    this.#queue.setConcurrency(concurrency);
  }
  
  setRateLimit(interval: number, cap: number): void {
    this.#queue.setRateLimit(interval, cap);
  }
  
  getHealth(): QueueHealth {
    const stats = this.getStats();
    const issues: string[] = [];
    let status: QueueHealth['status'] = 'healthy';
    
    // Check utilization
    if (stats.utilization > 0.9) {
      issues.push('High queue utilization');
      status = 'degraded';
    }
    
    // Check wait times
    if (stats.averageWaitTime > 30000) { // 30s
      issues.push('High average wait time');
      status = 'degraded';
    }
    
    // Check failure rate
    const failureRate = stats.failed / (stats.completed + stats.failed);
    if (failureRate > 0.1) { // 10%
      issues.push('High failure rate');
      status = status === 'healthy' ? 'degraded' : 'critical';
    }
    
    // Check queue size
    if (stats.size > stats.concurrency * 10) {
      issues.push('Queue backlog is very large');
      status = 'critical';
    }
    
    return {
      status,
      issues,
      uptime: Date.now() - this.#startTime,
      memoryUsage: process.memoryUsage().heapUsed
    };
  }
  
  async shutdown(options: ShutdownOptions = {}): Promise<void> {
    const {
      timeout = 30000,
      force = true,
      stopAccepting = true
    } = options;
    
    if (stopAccepting) {
      this.pause();
    }
    
    // Wait for running tasks to complete
    const waitPromise = this.waitForIdle();
    const timeoutPromise = new Promise<void>((resolve) => 
      setTimeout(resolve, timeout)
    );
    
    await Promise.race([waitPromise, timeoutPromise]);
    
    // Force kill remaining tasks if requested
    if (force) {
      const running = this.getRunningTasks();
      for (const task of running) {
        this.#processManager.kill(task.id, 9); // SIGKILL
      }
    }
    
    this.clear();
  }
  
  private average(numbers: number[]): number {
    return numbers.length > 0 
      ? numbers.reduce((a, b) => a + b, 0) / numbers.length 
      : 0;
  }
  
  private calculateThroughput(tasks: TaskStats[]): number {
    const completed = tasks.filter(t => t.completedAt);
    if (completed.length === 0) return 0;
    
    const minute = 60 * 1000;
    const now = Date.now();
    const recentlyCompleted = completed.filter(t => 
      now - t.completedAt! < minute
    );
    
    return recentlyCompleted.length; // tasks per minute
  }
}

interface TaskStats {
  queuedAt: number;
  startedAt: number;
  completedAt?: number;
  waitTime: number;
  runTime?: number;
}
```

## CLI Integration

### Queue Status Command

```typescript
// src/cli/queue-status.ts

export async function showQueueStatus(manager: ProcessManager): Promise<void> {
  const stats = manager.getQueueStats();
  const health = manager.getQueueHealth();
  
  console.log('Queue Status:');
  console.log(`  Queued: ${stats.size}`);
  console.log(`  Running: ${stats.pending}/${stats.concurrency}`);
  console.log(`  Utilization: ${(stats.utilization * 100).toFixed(1)}%`);
  console.log(`  Health: ${health.status}`);
  
  if (health.issues.length > 0) {
    console.log('\nIssues:');
    health.issues.forEach(issue => console.log(`  - ${issue}`));
  }
  
  console.log('\nPerformance:');
  console.log(`  Avg wait time: ${stats.averageWaitTime}ms`);
  console.log(`  Avg run time: ${stats.averageRunTime}ms`);
  console.log(`  Throughput: ${stats.throughput} tasks/min`);
}
```

### Queue Control Commands

```bash
# CLI examples
bun run queue status
bun run queue pause
bun run queue resume  
bun run queue clear
bun run queue set-concurrency 10
```

## Testing

### Unit Tests

```typescript
describe('QueueManager', () => {
  test('pause/resume affects new tasks', async () => {
    const manager = new ProcessManager({ queue: { concurrency: 1 } });
    
    // Start long task
    manager.start({ cmd: ['sleep', '1'] });
    
    // Pause queue
    manager.pauseQueue();
    
    // Add task while paused
    const paused = manager.start({ cmd: ['echo', 'paused'] });
    expect(paused.status).toBe('queued');
    
    // Should still be queued after delay
    await new Promise(r => setTimeout(r, 100));
    expect(manager.getQueuedTasks()).toHaveLength(1);
    
    // Resume
    manager.resumeQueue();
    
    // Should start now
    await waitForStatus(manager, paused.id, 'running');
  });
  
  test('cancelTasks with predicate', () => {
    const manager = new ProcessManager({ queue: { concurrency: 1 } });
    
    // Fill queue
    manager.start({ cmd: ['sleep', '1'] }); // running
    manager.start({ cmd: ['echo', '1'], tags: ['batch'] }); // queued
    manager.start({ cmd: ['echo', '2'], tags: ['user'] }); // queued
    manager.start({ cmd: ['echo', '3'], tags: ['batch'] }); // queued
    
    // Cancel batch tasks
    const cancelled = manager.cancelTasks(task => 
      task.tags?.includes('batch') ?? false
    );
    
    expect(cancelled).toHaveLength(2);
    expect(manager.getQueuedTasks()).toHaveLength(1);
  });
  
  test('shutdown with timeout', async () => {
    const manager = new ProcessManager({ queue: { concurrency: 2 } });
    
    // Start long tasks
    manager.start({ cmd: ['sleep', '10'] });
    manager.start({ cmd: ['sleep', '10'] });
    
    const start = Date.now();
    await manager.shutdown({ timeout: 1000, force: true });
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(2000); // Should force kill
    expect(manager.getRunningTasks()).toHaveLength(0);
  });
});
```

## Dependencies

- Task 007 (configurable queue)
- Task 008 (immediate start)  
- Task 009 (async API)

## Success Criteria

- Comprehensive queue monitoring
- Reliable pause/resume functionality
- Proper task cancellation
- Accurate statistics
- Graceful shutdown capabilities
- Good performance under load
- Clear CLI integration