// src/core/types.ts
export type TaskStatus = 'running' | 'exited' | 'killed' | 'timeout' | 'start-failed';

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

/** Per-task queue options */
export interface TaskQueueOptions {
  /** Skip queue and start immediately */
  immediate?: boolean;
  
  /** Task priority (higher runs first) */
  priority?: number;
  
  /** Custom timeout for this specific task */
  timeout?: number;
  
  /** Unique identifier for priority adjustments */
  id?: string;
  
  /** Task metadata for queue filtering and management */
  metadata?: Record<string, unknown>;
  
  /** AbortSignal for task cancellation */
  signal?: AbortSignal;
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
}

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

/** Custom queue class interface for advanced users */
export interface QueueClass {
  new(options?: any): {
    enqueue(task: any, options?: any): void;
    dequeue(): any;
    readonly size: number;
    filter(options: any): any[];
  };
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
  | 'queue:next';    // Task finished (success or failure)
