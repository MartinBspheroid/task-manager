// src/core/interfaces/ITaskLifecycle.ts

import type { TaskInfo } from '../types';
import type { ExitInfo, ProcessStatus } from './IProcessRunner';

/** Interface for task lifecycle management and hooks */
export interface ITaskLifecycle {
  /** Task was added to queue (if queuing enabled) */
  onQueued?(info: TaskInfo): void | Promise<void>;
  
  /** Task is about to start (before process spawn) */
  onStarting?(info: TaskInfo): void | Promise<void>;
  
  /** Task started running (after successful spawn) */
  onRunning?(info: TaskInfo): void | Promise<void>;
  
  /** Task completed successfully */
  onCompleted?(info: TaskInfo, exit: ExitInfo): void | Promise<void>;
  
  /** Task failed with error */
  onFailed?(info: TaskInfo, error: Error): void | Promise<void>;
  
  /** Task was terminated (killed) */
  onTerminated?(info: TaskInfo, exit: ExitInfo): void | Promise<void>;
  
  /** Task timed out */
  onTimeout?(info: TaskInfo, exit: ExitInfo): void | Promise<void>;
  
  /** Task output was received */
  onOutput?(info: TaskInfo, data: string, stream: 'stdout' | 'stderr'): void | Promise<void>;
  
  /** Task status changed */
  onStatusChange?(info: TaskInfo, oldStatus: ProcessStatus, newStatus: ProcessStatus): void | Promise<void>;
}

/** Lifecycle hook registration and management */
export interface ITaskLifecycleManager {
  /** Register lifecycle hooks */
  register(hooks: ITaskLifecycle): void;
  
  /** Unregister lifecycle hooks */
  unregister(hooks: ITaskLifecycle): void;
  
  /** Clear all hooks */
  clear(): void;
  
  /** Execute lifecycle hooks for an event */
  execute<T extends keyof ITaskLifecycle>(
    event: T,
    ...args: Parameters<NonNullable<ITaskLifecycle[T]>>
  ): Promise<void>;
  
  /** Check if any hooks are registered for an event */
  hasHooks(event: keyof ITaskLifecycle): boolean;
  
  /** Get hook execution statistics */
  getStats(): LifecycleStats;
}

/** Statistics for lifecycle hook execution */
export interface LifecycleStats {
  /** Total hooks registered */
  totalHooks: number;
  
  /** Hooks executed by event type */
  executionCounts: Record<keyof ITaskLifecycle, number>;
  
  /** Average execution time by event type (in ms) */
  averageExecutionTime: Record<keyof ITaskLifecycle, number>;
  
  /** Total hook execution failures */
  totalFailures: number;
  
  /** Hook failures by event type */
  failureCounts: Record<keyof ITaskLifecycle, number>;
}

/** Configuration for lifecycle hook execution */
export interface LifecycleConfig {
  /** Maximum time to wait for hook execution (ms) */
  timeout?: number;
  
  /** Whether to continue if a hook fails */
  continueOnError?: boolean;
  
  /** Maximum number of concurrent hook executions */
  maxConcurrency?: number;
  
  /** Whether to emit events for hook execution */
  emitEvents?: boolean;
}

/** Events emitted during lifecycle hook execution */
export interface LifecycleEvents {
  /** Hook started executing */
  'hook:start': (event: keyof ITaskLifecycle, taskId: string) => void;
  
  /** Hook completed successfully */
  'hook:complete': (event: keyof ITaskLifecycle, taskId: string, duration: number) => void;
  
  /** Hook failed with error */
  'hook:error': (event: keyof ITaskLifecycle, taskId: string, error: Error) => void;
  
  /** Hook timed out */
  'hook:timeout': (event: keyof ITaskLifecycle, taskId: string) => void;
}

/** Utility type for extracting hook parameters */
export type LifecycleHookParams<T extends keyof ITaskLifecycle> = Parameters<NonNullable<ITaskLifecycle[T]>>;

/** Utility type for lifecycle hook return types */
export type LifecycleHookReturn<T extends keyof ITaskLifecycle> = ReturnType<NonNullable<ITaskLifecycle[T]>>;

/** Predefined lifecycle hook implementations */
export interface ILifecycleHookPresets {
  /** Logging hooks that log to console */
  createLoggingHooks(options?: LoggingHookOptions): ITaskLifecycle;
  
  /** Metrics hooks that collect statistics */
  createMetricsHooks(options?: MetricsHookOptions): ITaskLifecycle;
  
  /** Notification hooks that send alerts */
  createNotificationHooks(options?: NotificationHookOptions): ITaskLifecycle;
}

/** Options for logging hooks */
export interface LoggingHookOptions {
  /** Log level */
  level?: 'debug' | 'info' | 'warn' | 'error';
  
  /** Include task output in logs */
  includeOutput?: boolean;
  
  /** Custom logger function */
  logger?: (level: string, message: string, data?: any) => void;
}

/** Options for metrics hooks */
export interface MetricsHookOptions {
  /** Metrics collection interval (ms) */
  interval?: number;
  
  /** Custom metrics reporter */
  reporter?: (metrics: TaskMetrics) => void;
}

/** Options for notification hooks */
export interface NotificationHookOptions {
  /** Notify on these events only */
  events?: (keyof ITaskLifecycle)[];
  
  /** Custom notification sender */
  sender?: (event: string, taskInfo: TaskInfo, data?: any) => Promise<void>;
}

/** Task metrics collected by metrics hooks */
export interface TaskMetrics {
  /** Task ID */
  taskId: string;
  
  /** Task command */
  command: string[];
  
  /** Task duration (ms) */
  duration: number;
  
  /** Exit code */
  exitCode: number | null;
  
  /** Memory usage (bytes) */
  memoryUsage?: number;
  
  /** CPU usage (percentage) */
  cpuUsage?: number;
  
  /** Task tags */
  tags?: string[];
}