// src/core/ProcessManager.ts
import { ProcessTask, type ProcessTaskOpts } from './ProcessTask';
import type { TaskInfo, HookCallbacks } from './types';
import { HookManager } from './HookManager';

export class ProcessManager {
  #tasks = new Map<string, ProcessTask>();
  #globalHooks: HookCallbacks = {};
  #hookManager = new HookManager();

  start(opts: ProcessTaskOpts): TaskInfo {
    // Merge global hooks with task-specific hooks
    const mergedHooks = this.#hookManager.mergeHooks(this.#globalHooks, opts.hooks);
    const enhancedOpts = { ...opts, hooks: mergedHooks };
    
    const task = new ProcessTask(enhancedOpts);
    this.#tasks.set(task.info.id, task);
    // Keep tasks in the list even after they exit for status tracking
    return task.info;
  }

  list(): TaskInfo[] {
    return [...this.#tasks.values()].map((t) => t.info);
  }

  listRunning(): TaskInfo[] {
    return [...this.#tasks.values()]
      .filter((t) => t.info.status === 'running')
      .map((t) => t.info);
  }

  kill(id: string, signal?: NodeJS.Signals) {
    const task = this.#tasks.get(id);
    if (!task) throw new Error(`task ${id} not found`);
    task.terminate(signal);
  }

  write(id: string, input: string) {
    const task = this.#tasks.get(id);
    if (!task) throw new Error(`task ${id} not found`);
    task.write(input);
  }

  killAll(signal?: NodeJS.Signals): string[] {
    const killedIds: string[] = [];
    for (const task of this.#tasks.values()) {
      if (task.info.status === 'running') {
        task.terminate(signal);
        killedIds.push(task.info.id);
      }
    }
    return killedIds;
  }

  killByTag(tag: string, signal?: NodeJS.Signals): string[] {
    const killedIds: string[] = [];
    for (const task of this.#tasks.values()) {
      if (task.info.status === 'running' && task.info.tags?.includes(tag)) {
        task.terminate(signal);
        killedIds.push(task.info.id);
      }
    }
    return killedIds;
  }

  registerGlobalHooks(hooks: HookCallbacks): void {
    this.#globalHooks = this.#hookManager.mergeHooks(this.#globalHooks, hooks);
  }

  clearGlobalHooks(): void {
    this.#globalHooks = {};
  }

  getGlobalHooks(): HookCallbacks {
    return { ...this.#globalHooks };
  }
}
