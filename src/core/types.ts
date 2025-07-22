import { QueueClass } from "./interfaces";

// src/core/types.ts
export type TaskStatus = 'running' | 'exited' | 'killed' | 'timeout' | 'start-failed' | 'queued';

export interface TaskInfo {
  id: string;          // UUID v4
  cmd: string[];
  pid: number;
  startedAt: number;   // epoch ms
  exitedAt?: number;
  status: TaskStatus;
  exitCode?: number | null;
  logFile: string;
  tags?: string[];     // optional tags for grouping
  startError?: Error;  // error if task failed to start
  metadata?: Record<string, unknown>; // task metadata for queue filtering
}

export interface ExitResult {
  taskInfo: TaskInfo;
  exitCode: number | null;
  signal: string | null;
  duration: number;
  stdout: string;
  stderr: string;
}

// Hook callback function types
export type HookCallback<T = any> = (taskInfo: TaskInfo, ...args: T[]) => void | Promise<void>;

// Specific hook callback types
export type OnSuccessHook = HookCallback<never>;
export type OnFailureHook = HookCallback<never>;
export type OnTerminatedHook = HookCallback<never>;
export type OnTimeoutHook = HookCallback<never>;
export type OnTaskStartFailHook = HookCallback<Error>;
export type OnChangeHook = HookCallback<string>; // newContent

// Hook callbacks configuration
export interface HookCallbacks {
  onSuccess?: OnSuccessHook[];
  onFailure?: OnFailureHook[];
  onTerminated?: OnTerminatedHook[];
  onTimeout?: OnTimeoutHook[];
  onTaskStartFail?: OnTaskStartFailHook[];
  onChange?: OnChangeHook[];
}

// Queue-related types and interfaces

/** Queue configuration options */
export interface QueueOptions {
  /** Maximum concurrent tasks (default: Infinity = disabled) */
  concurrency?: number;
  
  /** Rate limiting: max tasks per interval in milliseconds */
  interval?: number;
  intervalCap?: number;
  
  /** Auto-start queued tasks (default: true) */
  autoStart?: boolean;
  
  /** Queue implementation class (default: built-in p-queue) */
  queueClass?: QueueClass;
  
  /** Emit queue events on ProcessManager (default: false) */
  emitQueueEvents?: boolean;
  
  /** Default task timeout in milliseconds */
  timeout?: number;
  
  /** Throw on timeout (default: true) */
  throwOnTimeout?: boolean;
}

/** Priority aging configuration */
export interface PriorityAging {
  /** Enable priority aging */
  enabled: boolean;
  
  /** Priority increase per minute */
  increment: number;
  
  /** Maximum priority that can be reached through aging */
  maxPriority: number;
  
  /** When the task was queued (for aging calculation) */
  queuedAt?: number;
}

/** Per-task queue options */
export interface TaskQueueOptions {
  /** Skip queue and start immediately */
  immediate?: boolean;
  
  /** Task priority (higher runs first, default: 0) */
  priority?: number;
  
  /** Auto-adjust priority over time */
  aging?: PriorityAging;
  
  /** Custom timeout for this specific task */
  timeout?: number;
  
  /** Unique identifier for priority adjustments */
  id?: string;
  
  /** Task metadata for queue filtering and management */
  metadata?: Record<string, unknown>;
  
  /** AbortSignal for task cancellation */
  signal?: AbortSignal;
}

/** Priority constants for standardized usage */
export const PRIORITY = {
  CRITICAL: 1000,
  HIGH: 100, 
  NORMAL: 0,
  LOW: -100,
  BATCH: -1000
} as const;

/** Type for priority levels */
export type PriorityLevel = typeof PRIORITY[keyof typeof PRIORITY];

/** Queued task information with priority details */
export interface QueuedTaskInfo {
  /** Task ID */
  id: string;
  
  /** Original priority */
  basePriority: number;
  
  /** Current effective priority (including aging) */
  effectivePriority: number;
  
  /** Time when task was queued */
  queuedAt: number;
  
  /** Priority aging configuration if enabled */
  aging?: PriorityAging;
  
  /** Task metadata */
  metadata?: Record<string, unknown>;
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
  
  /** Total tasks that failed */
  totalFailed: number;
  
  /** Total tasks that were cancelled */
  totalCancelled: number;
  
  /** Average time tasks wait in queue (ms) */
  averageWaitTime: number;
  
  /** Average time tasks take to run (ms) */
  averageRunTime: number;
  
  /** Tasks completed per second */
  throughput: number;
  
  /** Queue utilization percentage (0-100) */
  utilization: number;
  
  /** Rate limit: remaining capacity in current interval */
  intervalRemaining?: number;
  
  /** Rate limit: when current interval resets (epoch ms) */
  intervalResetTime?: number;
}

/** Queue health status */
export interface QueueHealth {
  /** Overall health status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  
  /** Identified issues */
  issues: string[];
  
  /** Memory usage in bytes */
  memoryUsage: number;
  
  /** Queue processing rate (tasks/sec) */
  processingRate: number;
  
  /** Average task wait time in current window */
  averageWaitTimeWindow: number;
  
  /** Timestamp of last health check */
  lastCheck: number;
}

/** Shutdown options */
export interface ShutdownOptions {
  /** Timeout in ms to wait for tasks to complete */
  timeout?: number;
  
  /** Force shutdown after timeout */
  force?: boolean;
  
  /** Cancel pending tasks during shutdown */
  cancelPending?: boolean;
}

/** Task predicate function for filtering */
export type TaskPredicate = (task: TaskInfo) => boolean;

/** Queue management interface */
export interface QueueInterface {
  /** Pause processing new tasks */
  pause(): void;
  
  /** Resume processing */
  resume(): void;
  
  /** Clear pending tasks */
  clear(): void;
  
  /** Get queue statistics */
  stats(): QueueStats;
  
  /** Check if queue is idle (no pending tasks) */
  isIdle(): boolean;
  
  /** Check if queue is empty (no waiting tasks) */
  isEmpty(): boolean;
  
  /** Wait for queue to become empty */
  onEmpty(): Promise<void>;
  
  /** Wait for queue to become idle */
  onIdle(): Promise<void>;
  
  /** Wait for queue size to be less than specified */
  onSizeLessThan(size: number): Promise<void>;
  
  /** Get number of tasks with specific criteria */
  sizeBy(options: Partial<TaskQueueOptions>): number;
  
  /** Change priority of a queued task by id */
  setPriority(id: string, priority: number): void;
}

/** Enhanced queue manager interface for Task 010 */
export interface QueueManager extends QueueInterface {
  /** Cancel multiple tasks by predicate */
  cancelTasks(predicate: TaskPredicate): Promise<string[]>;
  
  /** Reprioritize a task by ID */
  reprioritizeTask(taskId: string, priority: number): boolean;
  
  /** Get enhanced queue statistics */
  getStats(): QueueStats;
  
  /** Get tasks currently queued */
  getQueuedTasks(): TaskInfo[];
  
  /** Get tasks currently running */
  getRunningTasks(): TaskInfo[];
  
  /** Wait for queue to have available slot */
  waitForAvailableSlot(): Promise<void>;
  
  /** Set concurrency limit */
  setConcurrency(limit: number): void;
  
  /** Set rate limiting */
  setRateLimit(interval: number, cap: number): void;
  
  /** Get queue health status */
  getHealth(): QueueHealth;
  
  /** Graceful shutdown with options */
  shutdown(options?: ShutdownOptions): Promise<void>;
}


/** Queue events that can be emitted by ProcessManager */
export type QueueEventType = 
  | 'queue:add'      // Task added to queue
  | 'queue:start'    // Task started executing
  | 'queue:active'   // Task became active
  | 'queue:completed'// Task completed successfully
  | 'queue:error'    // Task failed with error
  | 'queue:idle'     // Queue became idle
  | 'queue:empty'    // Queue became empty
  | 'queue:next'     // Task finished (success or failure)
  | 'queue:paused'   // Queue was paused
  | 'queue:resumed'  // Queue was resumed
  | 'queue:cleared'  // Queue was cleared
  | 'task:cancelled' // Task was cancelled
  | 'task:timeout'   // Task timed out
  | 'queue:stats';   // Queue statistics updated

/** Default queue configuration preserving v1.x behavior */
export const DEFAULT_QUEUE_CONFIG = {
  concurrency: Infinity,
  autoStart: true,
  emitQueueEvents: false,
  throwOnTimeout: true
} as const;

/** ProcessManager constructor options */
export interface ProcessManagerOptions {
  /** Default log directory for tasks */
  defaultLogDir?: string;
  
  /** Queue configuration */
  queue?: QueueOptions;
  
  /** Global hooks for all tasks */
  hooks?: HookCallbacks;
}
