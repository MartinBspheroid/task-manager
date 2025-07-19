// src/core/types.ts
export type TaskStatus = 'running' | 'exited' | 'killed' | 'timeout';

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
}
