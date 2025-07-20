// src/core/TaskHandle.ts

import type { TaskInfo, ExitResult } from './types';
import type { ProcessTask } from './ProcessTask';
import type { ProcessManager } from './ProcessManager';

export class TaskHandle {
  readonly #task: ProcessTask;
  readonly #manager: ProcessManager;
  
  constructor(task: ProcessTask, manager: ProcessManager) {
    this.#task = task;
    this.#manager = manager;
  }
  
  get info(): TaskInfo {
    return { ...this.#task.info }; // Return copy
  }
  
  async onQueued(): Promise<void> {
    // Since ProcessTask doesn't emit 'queued' events, we just check status
    if (this.#task.info.status === 'queued') return;
    
    // If not queued, this resolves immediately
    return Promise.resolve();
  }
  
  async onStarted(): Promise<void> {
    // For ProcessTask, we don't have a separate 'started' event
    // A task that's not 'start-failed' or 'queued' is considered started
    if (this.#task.info.status === 'running') return;
    if (this.#task.info.status === 'start-failed') {
      throw this.#task.info.startError || new Error('Task failed to start');
    }
    
    // For queued tasks, we need to wait for the status to change
    return new Promise((resolve, reject) => {
      const checkStatus = () => {
        if (this.#task.info.status === 'running') {
          resolve();
        } else if (this.#task.info.status === 'start-failed') {
          reject(this.#task.info.startError || new Error('Task failed to start'));
        }
        // Continue waiting for other statuses
      };
      
      // Check every 50ms
      const interval = setInterval(checkStatus, 50);
      
      // Set a reasonable timeout
      const timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error('Timeout waiting for task to start'));
      }, 10000);
      
      const cleanup = () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
      
      // Listen for start-failed events
      const onError = () => {
        cleanup();
        reject(this.#task.info.startError || new Error('Task failed to start'));
      };
      
      this.#task.once('start-failed', onError);
      
      // Initial check
      checkStatus();
    });
  }
  
  async onCompleted(): Promise<ExitResult> {
    return this.#manager.waitForTask(this.#task.info.id);
  }
  
  async waitToStart(): Promise<void> {
    if (this.#task.info.status === 'running') return;
    if (this.#task.info.status === 'queued') {
      await this.onStarted();
    }
  }
  
  async waitToFinish(): Promise<ExitResult> {
    await this.waitToStart();
    return this.onCompleted();
  }
  
  cancel(): void {
    if (this.#task.info.status === 'queued') {
      // Remove from queue
      this.#manager.cancelTask(this.#task.info.id);
    }
  }
  
  kill(signal?: string): void {
    this.#manager.kill(this.#task.info.id, signal as NodeJS.Signals);
  }
}