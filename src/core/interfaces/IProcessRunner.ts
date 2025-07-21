// src/core/interfaces/IProcessRunner.ts

import { EventEmitter } from 'events';
import type { TaskInfo, HookCallbacks } from '../types';

/** Interface for running processes with optional queuing */
export interface IProcessRunner {
  /** Start a process immediately (bypass queue) */
  run(opts: ProcessRunOptions): ProcessHandle;
  
  /** Queue a process for later execution */
  queue(opts: ProcessRunOptions): Promise<ProcessHandle>;
  
  /** Check if queuing is enabled */
  isQueuingEnabled(): boolean;
  
  /** Get queue statistics if available */
  getQueueStats(): QueueRunnerStats | null;
  
  /** Set queue configuration */
  setQueueConfig(config: QueueRunnerConfig): void;
  
  /** Get current queue configuration */
  getQueueConfig(): QueueRunnerConfig;
}

/** Options for running a process */
export interface ProcessRunOptions {
  /** Command and arguments */
  cmd: string[];
  
  /** Directory for log files */
  logDir: string;
  
  /** Idle timeout in milliseconds */
  idleTimeoutMs?: number;
  
  /** Tags for process grouping */
  tags?: string[];
  
  /** Hook callbacks */
  hooks?: HookCallbacks;
  
  /** Queue-specific options */
  queue?: ProcessQueueOptions;
}

/** Queue options for individual processes */
export interface ProcessQueueOptions {
  /** Skip queue and start immediately */
  immediate?: boolean;
  
  /** Task priority (higher runs first) */
  priority?: number;
  
  /** Custom timeout for this task */
  timeout?: number;
  
  /** Unique identifier for priority adjustments */
  id?: string;
  
  /** Task metadata */
  metadata?: Record<string, unknown>;
  
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/** Handle for a running or queued process */
export interface ProcessHandle {
  /** Unique process identifier */
  readonly id: string;
  
  /** Current process information */
  readonly info: TaskInfo;
  
  /** Event emitter for process events */
  readonly events: EventEmitter;
  
  /** Current status */
  readonly status: ProcessStatus;
  
  /** Write data to process stdin */
  write(data: string | Uint8Array): void;
  
  /** Kill the process */
  kill(signal?: NodeJS.Signals): void;
  
  /** Wait for process to complete */
  wait(): Promise<ExitInfo>;
  
  /** Check if process is still running */
  isRunning(): boolean;
  
  /** Get process uptime in milliseconds */
  getUptime(): number;
}

/** Process exit information */
export interface ExitInfo {
  /** Exit code (null if killed by signal) */
  exitCode: number | null;
  
  /** Signal that killed the process (null if exited normally) */
  signal: string | null;
  
  /** Process duration in milliseconds */
  duration: number;
  
  /** Final status */
  status: ProcessStatus;
  
  /** Exit timestamp */
  exitedAt: number;
}

/** Process status enumeration */
export enum ProcessStatus {
  /** Process is queued for execution */
  QUEUED = 'queued',
  
  /** Process is currently running */
  RUNNING = 'running',
  
  /** Process exited normally */
  EXITED = 'exited',
  
  /** Process was killed */
  KILLED = 'killed',
  
  /** Process timed out */
  TIMEOUT = 'timeout',
  
  /** Process failed to start */
  START_FAILED = 'start-failed'
}

/** Queue configuration for process runner */
export interface QueueRunnerConfig {
  /** Enable queuing (default: false) */
  enabled?: boolean;
  
  /** Maximum concurrent processes */
  concurrency?: number;
  
  /** Rate limiting interval in milliseconds */
  interval?: number;
  
  /** Maximum processes per interval */
  intervalCap?: number;
  
  /** Auto-start queued processes */
  autoStart?: boolean;
  
  /** Default timeout for processes */
  timeout?: number;
  
  /** Emit queue events */
  emitEvents?: boolean;
}

/** Statistics for queue runner */
export interface QueueRunnerStats {
  /** Processes waiting in queue */
  queued: number;
  
  /** Processes currently running */
  running: number;
  
  /** Total processes started */
  totalStarted: number;
  
  /** Total processes completed */
  totalCompleted: number;
  
  /** Total processes failed */
  totalFailed: number;
  
  /** Queue is paused */
  paused: boolean;
  
  /** Average process duration in milliseconds */
  averageDuration: number;
}

/** Events emitted by process runner */
export interface ProcessRunnerEvents {
  /** Process added to queue */
  'process:queued': (handle: ProcessHandle) => void;
  
  /** Process started running */
  'process:started': (handle: ProcessHandle) => void;
  
  /** Process completed successfully */
  'process:completed': (handle: ProcessHandle, exit: ExitInfo) => void;
  
  /** Process failed */
  'process:failed': (handle: ProcessHandle, error: Error) => void;
  
  /** Queue became idle */
  'queue:idle': () => void;
  
  /** Queue became empty */
  'queue:empty': () => void;
}

/** Factory for creating process runners */
export interface IProcessRunnerFactory {
  /** Create a new process runner */
  create(config?: QueueRunnerConfig): IProcessRunner;
}