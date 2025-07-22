/**
 * Task Manager - A TypeScript task manager for spawning and managing child processes
 * 
 * This module provides a comprehensive system for managing child processes with
 * logging, timeout capabilities, and advanced task lifecycle management.
 */

// Main classes - Core functionality
export { ProcessManager } from './src/core/ProcessManager';
export { ProcessTask } from './src/core/ProcessTask';
export { TaskHandle } from './src/core/TaskHandle';
export { HookManager } from './src/core/HookManager';

// Supporting classes - Advanced features
export { ProcessQueue } from './src/core/ProcessQueue';
export { LogFileWatcher } from './src/core/LogFileWatcher';
export { FeatureDetector } from './src/core/FeatureDetector';
export { ExecutionPathDetector } from './src/core/ExecutionPathDetector';

// Types and interfaces - Complete type definitions
export * from './src/core/types';
export * from './src/core/interfaces/index';

// Queue adapters - For custom queue implementations
export * from './src/core/adapters/index';

// Re-export commonly used types for convenience
export type {
  TaskInfo,
  TaskStatus,
  ExitResult,
  ProcessManagerOptions,
  QueueOptions,
  TaskQueueOptions,
  QueueStats,
  HookCallbacks
} from './src/core/types';

export type {
  ProcessTaskOpts
} from './src/core/ProcessTask';