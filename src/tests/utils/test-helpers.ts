// src/tests/utils/test-helpers.ts
import { mkdirSync } from 'fs';
import * as fs from 'fs';
import { ProcessManager } from '../../core/ProcessManager';
import type { TaskInfo, TaskStatus } from '../../core/types';

/**
 * Wait for a specific task to reach a target status
 */
export async function waitForStatus(
  manager: ProcessManager, 
  taskId: string, 
  status: TaskStatus,
  timeout = 5000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const task = manager.list().find(t => t.id === taskId);
    if (task?.status === status) return;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error(`Timeout waiting for task ${taskId} to reach status ${status}`);
}

/**
 * Wait for task count condition to be met
 */
export async function waitForTaskCount(
  manager: ProcessManager,
  predicate: (tasks: TaskInfo[]) => boolean,
  timeout = 5000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate(manager.list())) return;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error('Timeout waiting for task count condition');
}

/**
 * Wait for file content to meet a condition
 */
export async function waitForFileContent(
  filePath: string,
  predicate: (content: string) => boolean,
  timeout = 5000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      if (predicate(content)) return;
    } catch {
      // File might not exist yet
    }
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error(`Timeout waiting for file content condition: ${filePath}`);
}

/**
 * Create a ProcessManager configured for testing
 */
export function createTestManager(): ProcessManager {
  // Ensure test logs directory
  mkdirSync('test-logs', { recursive: true });
  return new ProcessManager();
}

/**
 * EventWaiter class for waiting on specific events
 */
export class EventWaiter<T = any> {
  private promise: Promise<T>;
  private resolve!: (value: T) => void;

  constructor() {
    this.promise = new Promise(r => this.resolve = r);
  }

  wait(timeout?: number): Promise<T> {
    if (!timeout) return this.promise;
    return Promise.race([
      this.promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('EventWaiter timeout')), timeout)
      )
    ]);
  }

  emit(value: T): void {
    this.resolve(value);
  }
}

/**
 * Wait for running task count to reach target
 */
export async function waitForRunningCount(
  manager: ProcessManager,
  count: number,
  timeout = 5000
): Promise<void> {
  return waitForTaskCount(
    manager, 
    tasks => tasks.filter(t => t.status === 'running').length === count,
    timeout
  );
}

/**
 * Wait for any task to exit
 */
export async function waitForAnyExit(
  manager: ProcessManager,
  timeout = 5000
): Promise<TaskInfo> {
  const start = Date.now();
  const initialTasks = manager.list();
  
  while (Date.now() - start < timeout) {
    const currentTasks = manager.list();
    const exitedTask = currentTasks.find(task => 
      task.status === 'exited' || 
      task.status === 'killed' || 
      task.status === 'timeout'
    );
    
    if (exitedTask && !initialTasks.some(t => 
      t.id === exitedTask.id && 
      (t.status === 'exited' || t.status === 'killed' || t.status === 'timeout')
    )) {
      return exitedTask;
    }
    
    await new Promise(r => setTimeout(r, 10));
  }
  
  throw new Error('Timeout waiting for any task to exit');
}

/**
 * Cleanup test logs directory
 */
export function cleanupTestLogs(): void {
  try {
    if (fs.existsSync('test-logs')) {
      fs.rmSync('test-logs', { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}