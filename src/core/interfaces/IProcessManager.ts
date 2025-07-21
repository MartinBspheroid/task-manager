// src/core/interfaces/IProcessManager.ts

import type { EventEmitter } from 'events';
import type { TaskInfo, TaskStatus, HookCallbacks } from '../types';
import type { QueueOptions, TaskQueueOptions } from '../types';
import type { IQueue } from './IQueue';

/** Enhanced ProcessManager interface with backward compatibility guarantees */
export interface IProcessManager extends EventEmitter {
  // ========== ORIGINAL v1.x API (unchanged) ==========
  
  /** Start a process (synchronous, backward compatible) */
  start(opts: ProcessTaskOpts): TaskInfo;
  
  /** List all tasks */
  list(): TaskInfo[];
  
  /** List only running tasks */
  listRunning(): TaskInfo[];
  
  /** Kill a specific task */
  kill(id: string, signal?: NodeJS.Signals): void;
  
  /** Write to task stdin */
  write(id: string, input: string): void;
  
  /** Kill all running tasks */
  killAll(signal?: NodeJS.Signals): string[];
  
  /** Kill tasks by tag */
  killByTag(tag: string, signal?: NodeJS.Signals): string[];
  
  /** Register global hooks */
  registerGlobalHooks(hooks: HookCallbacks): void;
  
  /** Clear global hooks */
  clearGlobalHooks(): void;
  
  /** Get global hooks */
  getGlobalHooks(): HookCallbacks;
  
  // ========== NEW v2.0 API (additive only) ==========
  
  /** Start a process (async, queue-aware) */
  startAsync(opts: ProcessTaskOpts): Promise<TaskInfo>;
  
  /** Configure queue options */
  setQueueOptions(options: QueueOptions): void;
  
  /** Get current queue options */
  getQueueOptions(): QueueOptions;
  
  /** Feature detection: always true in v2.0+ */
  readonly supportsQueue: boolean;
  
  /** Check if queuing is currently enabled */
  isQueuingEnabled(): boolean;
  
  /** Access queue interface (NullQueue if disabled) */
  readonly queue: IQueue;
  
  /** Wait for a task to reach specific status */
  waitForStatus(id: string, status: TaskStatus, timeout?: number): Promise<void>;
  
  /** Pause queue processing (no-op if disabled) */
  pauseQueue(): void;
  
  /** Resume queue processing (no-op if disabled) */
  resumeQueue(): void;
  
  /** Get queue statistics */
  getQueueStats(): QueueStats | null;
}

/** Options for ProcessManager constructor */
export interface ProcessManagerOptions {
  /** Queue configuration (optional, defaults to disabled) */
  queue?: QueueOptions;
  
  /** Global hooks applied to all tasks */
  globalHooks?: HookCallbacks;
  
  /** Default log directory */
  defaultLogDir?: string;
  
  /** Default idle timeout in milliseconds */
  defaultIdleTimeout?: number;
}

/** Extended task options with queue support */
export interface ProcessTaskOpts {
  /** Command and arguments */
  cmd: string[];
  
  /** Directory for log files */
  logDir: string;
  
  /** Idle timeout in milliseconds (default: 5 minutes) */
  idleTimeoutMs?: number;
  
  /** Tags for process grouping */
  tags?: string[];
  
  /** Hook callbacks */
  hooks?: HookCallbacks;
  
  /** Hook manager instance */
  hookManager?: any; // HookManager import would create circular dependency
  
  /** Queue-specific options */
  queue?: TaskQueueOptions;
}

/** Queue statistics and state */
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
  
  /** Total tasks failed since creation */
  totalFailed: number;
  
  /** Average task duration in milliseconds */
  averageDuration: number;
}

/** Execution strategy for dual-path implementation */
export enum ExecutionStrategy {
  /** Original immediate execution (v1.x compatible) */
  IMMEDIATE = 'immediate',
  
  /** Queue-based execution (v2.0 feature) */
  QUEUED = 'queued'
}

/** Internal interface for execution path detection */
export interface IExecutionPathDetector {
  /** Determine which execution strategy to use */
  getExecutionStrategy(
    queueOptions: QueueOptions,
    taskOptions?: TaskQueueOptions
  ): ExecutionStrategy;
  
  /** Check if queuing is effectively disabled */
  isQueuingDisabled(queueOptions: QueueOptions): boolean;
  
  /** Check if task should bypass queue */
  shouldBypassQueue(
    queueOptions: QueueOptions,
    taskOptions?: TaskQueueOptions
  ): boolean;
}

/** Events emitted by ProcessManager */
export interface ProcessManagerEvents {
  /** Task added to internal tracking */
  'task:added': (info: TaskInfo) => void;
  
  /** Task removed from internal tracking */
  'task:removed': (info: TaskInfo) => void;
  
  /** Task status changed */
  'task:status': (info: TaskInfo, oldStatus: TaskStatus, newStatus: TaskStatus) => void;
  
  /** Queue configuration changed */
  'queue:config': (options: QueueOptions) => void;
  
  /** Queue became idle */
  'queue:idle': () => void;
  
  /** Queue became empty */
  'queue:empty': () => void;
  
  /** Task added to queue */
  'queue:add': (info: TaskInfo) => void;
  
  /** Task started executing from queue */
  'queue:start': (info: TaskInfo) => void;
  
  /** Task completed from queue */
  'queue:complete': (info: TaskInfo) => void;
  
  /** Task failed in queue */
  'queue:error': (info: TaskInfo, error: Error) => void;
}

/** Configuration validation interface */
export interface IConfigurationValidator {
  /** Validate queue options */
  validateQueueOptions(options: QueueOptions): ValidationResult;
  
  /** Validate task options */
  validateTaskOptions(options: ProcessTaskOpts): ValidationResult;
  
  /** Check configuration compatibility */
  checkCompatibility(
    managerOptions: ProcessManagerOptions,
    taskOptions: ProcessTaskOpts
  ): CompatibilityResult;
}

/** Validation result */
export interface ValidationResult {
  /** Whether configuration is valid */
  valid: boolean;
  
  /** Validation errors */
  errors: string[];
  
  /** Validation warnings */
  warnings: string[];
}

/** Compatibility check result */
export interface CompatibilityResult extends ValidationResult {
  /** Detected execution strategy */
  strategy: ExecutionStrategy;
  
  /** Whether v1.x behavior is preserved */
  backwardCompatible: boolean;
  
  /** Compatibility notes */
  notes: string[];
}

/** Performance monitoring interface */
export interface IPerformanceMonitor {
  /** Record task start timing */
  recordStart(taskId: string, duration: number): void;
  
  /** Record task completion */
  recordCompletion(taskId: string, duration: number, success: boolean): void;
  
  /** Get performance statistics */
  getStats(): PerformanceStats;
  
  /** Reset performance counters */
  reset(): void;
}

/** Performance statistics */
export interface PerformanceStats {
  /** Total tasks processed */
  totalTasks: number;
  
  /** Average start time in milliseconds */
  averageStartTime: number;
  
  /** 95th percentile start time */
  p95StartTime: number;
  
  /** Average task duration */
  averageTaskDuration: number;
  
  /** Success rate (0-1) */
  successRate: number;
  
  /** Tasks per second */
  throughput: number;
}