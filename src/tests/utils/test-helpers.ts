// src/tests/utils/test-helpers.ts
import { mkdirSync } from 'fs';
import * as fs from 'fs';
import { ProcessManager } from '../../core/ProcessManager';
import type { TaskInfo, TaskStatus, ProcessManagerOptions } from '../../core/types';

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
 * Shared test setup - handles log directory creation and cleanup
 * Uses unique directory names to avoid conflicts in parallel testing
 */
export function setupTestEnvironment(): void {
  const testDir = getTestLogDir();
  cleanupTestLogs(testDir);
  mkdirSync(testDir, { recursive: true });
}

/**
 * Shared test teardown - cleans up test artifacts
 */
export function teardownTestEnvironment(): void {
  const testDir = getTestLogDir();
  cleanupTestLogs(testDir);
}

// Global test directory for this process
export const TEST_LOG_DIR = `test-logs-${process.pid}`;

/**
 * Get unique test log directory for current test file
 */
export function getTestLogDir(): string {
  return TEST_LOG_DIR;
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
 * Automatically uses unique directory to avoid parallel test conflicts
 */
export function createTestManager(options: ProcessManagerOptions = {}): ProcessManager {
  const testDir = getTestLogDir();
  // Ensure test logs directory
  mkdirSync(testDir, { recursive: true });
  return new ProcessManager({
    defaultLogDir: testDir,
    ...options
  });
}

/**
 * Get the test log directory that should be used for the current test
 * This maps 'test-logs' to the unique directory for parallel safety
 */
export function getTestLogDirFor(requestedDir: string): string {
  if (requestedDir === 'test-logs') {
    return getTestLogDir();
  }
  return requestedDir;
}

/**
 * Create a ProcessManager with queue configuration for testing
 */
export function createQueuedTestManager(concurrency: number = 2, options: ProcessManagerOptions = {}): ProcessManager {
  return createTestManager({
    queue: { concurrency },
    ...options
  });
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
 * Cleanup test logs directory - safe for concurrent access
 */
export function cleanupTestLogs(dir: string = 'test-logs'): void {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (error) {
    // Ignore cleanup errors - common in parallel testing
    // Don't log to avoid noise in test output
  }
}