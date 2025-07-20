// src/core/HookManager.ts
import type {
  TaskInfo,
  HookCallbacks,
  OnSuccessHook,
  OnFailureHook,
  OnTerminatedHook,
  OnTimeoutHook,
  OnTaskStartFailHook,
  OnChangeHook,
} from './types';

export class HookManager {
  private defaultTimeout = 5000; // 5 seconds

  async executeOnSuccess(taskInfo: TaskInfo, hooks: OnSuccessHook[] = []): Promise<void> {
    await this.executeHooks('onSuccess', hooks, taskInfo);
  }

  async executeOnFailure(taskInfo: TaskInfo, hooks: OnFailureHook[] = []): Promise<void> {
    await this.executeHooks('onFailure', hooks, taskInfo);
  }

  async executeOnTerminated(taskInfo: TaskInfo, hooks: OnTerminatedHook[] = []): Promise<void> {
    await this.executeHooks('onTerminated', hooks, taskInfo);
  }

  async executeOnTimeout(taskInfo: TaskInfo, hooks: OnTimeoutHook[] = []): Promise<void> {
    await this.executeHooks('onTimeout', hooks, taskInfo);
  }

  async executeOnTaskStartFail(
    taskInfo: TaskInfo,
    error: Error,
    hooks: OnTaskStartFailHook[] = []
  ): Promise<void> {
    await this.executeHooks('onTaskStartFail', hooks, taskInfo, error);
  }

  async executeOnChange(
    taskInfo: TaskInfo,
    newContent: string,
    hooks: OnChangeHook[] = []
  ): Promise<void> {
    await this.executeHooks('onChange', hooks, taskInfo, newContent);
  }

  mergeHooks(globalHooks: HookCallbacks = {}, taskHooks: HookCallbacks = {}): HookCallbacks {
    const result: HookCallbacks = {};
    
    const onSuccess = [...(globalHooks.onSuccess || []), ...(taskHooks.onSuccess || [])];
    const onFailure = [...(globalHooks.onFailure || []), ...(taskHooks.onFailure || [])];
    const onTerminated = [...(globalHooks.onTerminated || []), ...(taskHooks.onTerminated || [])];
    const onTimeout = [...(globalHooks.onTimeout || []), ...(taskHooks.onTimeout || [])];
    const onTaskStartFail = [...(globalHooks.onTaskStartFail || []), ...(taskHooks.onTaskStartFail || [])];
    const onChange = [...(globalHooks.onChange || []), ...(taskHooks.onChange || [])];
    
    if (onSuccess.length > 0) result.onSuccess = onSuccess;
    if (onFailure.length > 0) result.onFailure = onFailure;
    if (onTerminated.length > 0) result.onTerminated = onTerminated;
    if (onTimeout.length > 0) result.onTimeout = onTimeout;
    if (onTaskStartFail.length > 0) result.onTaskStartFail = onTaskStartFail;
    if (onChange.length > 0) result.onChange = onChange;
    
    return result;
  }

  private async executeHooks(
    hookType: string,
    hooks: any[],
    taskInfo: TaskInfo,
    ...args: any[]
  ): Promise<void> {
    if (!hooks || hooks.length === 0) return;

    const promises = hooks.map(async (hook) => {
      try {
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error(`Hook timeout: ${hookType}`)), this.defaultTimeout);
        });

        const hookPromise = Promise.resolve(hook(taskInfo, ...args));
        await Promise.race([hookPromise, timeoutPromise]);
      } catch (error) {
        console.error(`Hook execution error (${hookType}) for task ${taskInfo.id}:`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  determineHookType(taskInfo: TaskInfo): 'success' | 'failure' | 'terminated' | 'timeout' | null {
    switch (taskInfo.status) {
      case 'exited':
        return taskInfo.exitCode === 0 ? 'success' : 'failure';
      case 'killed':
        return 'terminated';
      case 'timeout':
        return 'timeout';
      default:
        return null;
    }
  }
}