// src/core/types.ts
export type TaskStatus = 'queued' | 'running' | 'exited' | 'killed' | 'timeout' | 'start-failed';

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
