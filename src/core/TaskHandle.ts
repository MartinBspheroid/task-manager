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
    // If already running or failed, resolve/reject immediately
    if (this.#task.info.status === 'running') return;
    if (this.#task.info.status === 'start-failed') {
      throw this.#task.info.startError || new Error('Task failed to start');
    }
    
    // For queued tasks, listen for the started event
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.#task.off('started', onStarted);
        this.#task.off('start-failed', onError);
      };
      
      const onStarted = () => {
        cleanup();
        resolve();
      };
      
      const onError = () => {
        cleanup();
        reject(this.#task.info.startError || new Error('Task failed to start'));
      };
      
      // Listen for events
      this.#task.once('started', onStarted);
      this.#task.once('start-failed', onError);
      
      // Check current status one more time in case we missed the event
      if (this.#task.info.status === 'running') {
        cleanup();
        resolve();
      } else if (this.#task.info.status === 'start-failed') {
        cleanup();
        reject(this.#task.info.startError || new Error('Task failed to start'));
      }
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