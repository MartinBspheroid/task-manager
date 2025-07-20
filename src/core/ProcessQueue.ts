// src/core/ProcessQueue.ts
import PQueue from 'p-queue';
import { ProcessTask } from './ProcessTask';

export class ProcessQueue {
  #queue = new PQueue({ concurrency: Infinity });

  add(task: ProcessTask): void {
    this.#queue.add(() => task.run());
  }

  get size(): number {
    return this.#queue.size;
  }

  get pending(): number {
    return this.#queue.pending;
  }
}
