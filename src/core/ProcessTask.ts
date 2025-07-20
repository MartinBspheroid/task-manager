// src/core/ProcessTask.ts
import { randomUUID } from 'crypto';
import { spawn } from 'bun';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import type { TaskInfo, TaskStatus, HookCallbacks } from './types';
import { HookManager } from './HookManager';

export interface ProcessTaskOpts {
  cmd: string[];
  logDir: string;
  idleTimeoutMs?: number;  // default 5 min
  tags?: string[];         // optional tags for grouping
  hooks?: HookCallbacks;   // hook callbacks
  hookManager?: HookManager; // optional custom hook manager
}

export class ProcessTask extends EventEmitter {
  readonly info: TaskInfo;
  #proc?: ReturnType<typeof spawn>;
  #logStream?: fs.WriteStream;
  #idleTimer?: NodeJS.Timeout;
  #hookManager: HookManager;
  #hooks: HookCallbacks;
  #idleTimeoutMs?: number;

  constructor(opts: ProcessTaskOpts) {
    super();

    const id = randomUUID();
    const logFile = `${opts.logDir}/${id}.log`;
    this.#hooks = opts.hooks || {};
    this.#hookManager = opts.hookManager || new HookManager();
    this.#idleTimeoutMs = opts.idleTimeoutMs;
    
    this.info = {
      id,
      cmd: opts.cmd,
      pid: -1,
      startedAt: 0,
      status: 'queued',
      logFile,
      tags: opts.tags,
    };
  }

  run(): void {
    this.info.status = 'running';
    this.info.startedAt = Date.now();
    try {
      // Initialize the process
      this.#initializeProcess({
        cmd: this.info.cmd,
        logDir: this.info.logFile.replace(/\/[^/]+$/, ''),
        hooks: this.#hooks,
        hookManager: this.#hookManager,
        tags: this.info.tags,
        idleTimeoutMs: this.#getIdleTimeoutMs(),
      });
    } catch (error) {
      // Handle startup failure
      this.#handleStartupFailure(error as Error);
    }
  }

  #getIdleTimeoutMs(): number | undefined {
    return this.#idleTimeoutMs;
  }

  #initializeProcess(opts: ProcessTaskOpts): void {
    // open log file early so we can pipe right away
    this.#logStream = fs.createWriteStream(this.info.logFile, { flags: 'a' });


    try {
      this.#proc = spawn({
        cmd: opts.cmd,
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'pipe',
      });

      this.info.pid = this.#proc.pid;

      const resetIdle = () => {
        if (this.#idleTimer) {
          clearTimeout(this.#idleTimer);
        }
        this.#idleTimer = setTimeout(() => this.#timeoutKill(), opts.idleTimeoutMs ?? 5 * 60_000);
      };
      resetIdle();

      // pipe + idle watchdog
      const pipe = (stream: ReadableStream) =>
        stream.pipeTo(
          new WritableStream({
            write: (chunk) => {
              this.#logStream?.write(chunk);
              resetIdle();
              
              // Trigger onChange hooks if they exist
              if (this.#hooks.onChange && this.#hooks.onChange.length > 0) {
                const content = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
                this.#hookManager.executeOnChange(this.info, content, this.#hooks.onChange);
              }
            },
          }),
        );

      if (this.#proc.stdout && typeof this.#proc.stdout !== 'number') {
        void pipe(this.#proc.stdout);
      }
      if (this.#proc.stderr && typeof this.#proc.stderr !== 'number') {
        void pipe(this.#proc.stderr);
      }

      // handle exit
      this.#proc.exited.then((code) => {
        this.#handleProcessExit(code);
      }).catch((error) => {
        console.error(`Process exit error for ${this.info.id}:`, error);
        this.#handleStartupFailure(error);
      });

    } catch (error) {
      throw error; // Re-throw to be caught by constructor
    }
  }

  #handleStartupFailure(error: Error): void {
    this.info.status = 'start-failed';
    this.info.startError = error;
    this.info.exitedAt = Date.now();
    
    // Clean up resources
    this.#cleanup();
    
    // Execute onTaskStartFail hooks
    if (this.#hooks.onTaskStartFail) {
      this.#hookManager.executeOnTaskStartFail(this.info, error, this.#hooks.onTaskStartFail);
    }
    
    this.emit('start-failed', this.info, error);
  }

  #handleProcessExit(code: number | null): void {
    if (this.#idleTimer) {
      clearTimeout(this.#idleTimer);
    }
    
    // Update status if still running
    if (this.info.status === 'running') {
      this.info.status = 'exited';
    }
    
    this.info.exitCode = code;
    this.info.exitedAt = Date.now();
    
    // Clean up resources
    this.#cleanup();
    
    // Execute appropriate hooks based on final status
    this.#executeExitHooks();
    
    this.emit('exit', this.info);
  }

  #executeExitHooks(): void {
    const hookType = this.#hookManager.determineHookType(this.info);
    
    switch (hookType) {
      case 'success':
        if (this.#hooks.onSuccess) {
          this.#hookManager.executeOnSuccess(this.info, this.#hooks.onSuccess);
        }
        break;
      case 'failure':
        if (this.#hooks.onFailure) {
          this.#hookManager.executeOnFailure(this.info, this.#hooks.onFailure);
        }
        break;
      case 'terminated':
        if (this.#hooks.onTerminated) {
          this.#hookManager.executeOnTerminated(this.info, this.#hooks.onTerminated);
        }
        break;
      case 'timeout':
        if (this.#hooks.onTimeout) {
          this.#hookManager.executeOnTimeout(this.info, this.#hooks.onTimeout);
        }
        break;
    }
  }

  #cleanup(): void {
    this.#logStream?.end();
  }

  /** send data to the child's STDIN */
  write(input: string) {
    if (this.#proc && typeof this.#proc.stdin !== 'number' && this.#proc.stdin) {
      this.#proc.stdin.write(input);
    }
  }

  /** external kill request */
  terminate(signal: NodeJS.Signals = 'SIGTERM') {
    if (this.info.status !== 'running' || !this.#proc) return;
    this.#proc.kill(signal);
    this.info.status = 'killed';
  }

  #timeoutKill() {
    if (this.info.status !== 'running' || !this.#proc) return;
    this.#proc.kill('SIGKILL');
    this.info.status = 'timeout';
  }
}
