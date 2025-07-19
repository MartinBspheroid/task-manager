// src/core/ProcessTask.ts
import { randomUUID } from 'crypto';
import { spawn } from 'bun';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import type { TaskInfo, TaskStatus } from './types';

export interface ProcessTaskOpts {
  cmd: string[];
  logDir: string;
  idleTimeoutMs?: number;  // default 5 min
}

export class ProcessTask extends EventEmitter {
  readonly info: TaskInfo;
  #proc: ReturnType<typeof spawn>;
  #logStream: fs.WriteStream;
  #idleTimer!: NodeJS.Timeout;

  constructor(opts: ProcessTaskOpts) {
    super();

    const id = randomUUID();
    const logFile = `${opts.logDir}/${id}.log`;
    this.info = {
      id,
      cmd: opts.cmd,
      pid: -1,
      startedAt: Date.now(),
      status: 'running',
      logFile,
    };

    // open log file early so we can pipe right away
    this.#logStream = fs.createWriteStream(logFile, { flags: 'a' });

    this.#proc = spawn({
      cmd: opts.cmd,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'pipe',
    });

    this.info.pid = this.#proc.pid;

    const resetIdle = () => {
      clearTimeout(this.#idleTimer);
      this.#idleTimer = setTimeout(() => this.#timeoutKill(), opts.idleTimeoutMs ?? 5 * 60_000);
    };
    resetIdle();

    // pipe + idle watchdog
    const pipe = (stream: ReadableStream) =>
      stream.pipeTo(
        new WritableStream({
          write: (chunk) => {
            this.#logStream.write(chunk);
            resetIdle();
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
      clearTimeout(this.#idleTimer);
      this.info.status = this.info.status === 'running' ? 'exited' : this.info.status;
      this.info.exitCode = code;
      this.info.exitedAt = Date.now();
      this.#logStream.end();
      this.emit('exit', this.info);
    });
  }

  /** send data to the child’s STDIN */
  write(input: string) {
    if (typeof this.#proc.stdin !== 'number' && this.#proc.stdin) {
      this.#proc.stdin.write(input);
    }
  }

  /** external kill request */
  terminate(signal: NodeJS.Signals = 'SIGTERM') {
    if (this.info.status !== 'running') return;
    this.#proc.kill(signal);
    this.info.status = 'killed';
  }

  #timeoutKill() {
    if (this.info.status !== 'running') return;
    this.#proc.kill('SIGKILL');
    this.info.status = 'timeout';
  }
}
