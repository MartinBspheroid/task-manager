// src/core/interfaces/IQueueFactory.ts

import type { IQueue } from './IQueue';

/** Factory interface for creating queue instances */
export interface IQueueFactory {
  /** Create a new queue instance with the given options */
  create(options: QueueFactoryOptions): IQueue;
  
  /** Get the name of this queue implementation */
  readonly name: string;
  
  /** Check if this factory supports the given features */
  supports(features: QueueFeature[]): boolean;
}

/** Options for queue factory */
export interface QueueFactoryOptions {
  /** Maximum concurrent tasks (default: Infinity = no limit) */
  concurrency?: number;
  
  /** Rate limiting: interval in milliseconds */
  interval?: number;
  
  /** Rate limiting: max tasks per interval */
  intervalCap?: number;
  
  /** Auto-start processing tasks (default: true) */
  autoStart?: boolean;
  
  /** Default timeout for tasks in milliseconds */
  timeout?: number;
  
  /** Throw on task timeout (default: true) */
  throwOnTimeout?: boolean;
  
  /** Custom queue class constructor */
  queueClass?: QueueClass;
}

/** Features that a queue implementation may support */
export enum QueueFeature {
  /** Basic task queuing */
  QUEUING = 'queuing',
  
  /** Priority-based execution */
  PRIORITY = 'priority',
  
  /** Rate limiting */
  RATE_LIMITING = 'rate_limiting',
  
  /** Task cancellation via AbortSignal */
  CANCELLATION = 'cancellation',
  
  /** Pause/resume functionality */
  PAUSE_RESUME = 'pause_resume',
  
  /** Task retry functionality */
  RETRY = 'retry',
  
  /** Delayed task execution */
  DELAY = 'delay',
  
  /** Event emission */
  EVENTS = 'events',
  
  /** Task filtering and metadata */
  FILTERING = 'filtering',
  
  /** Runtime priority adjustment */
  PRIORITY_ADJUSTMENT = 'priority_adjustment'
}

/** Interface for custom queue class constructors */
export interface QueueClass {
  new(options?: any): {
    enqueue(task: any, options?: any): void;
    dequeue(): any;
    readonly size: number;
    filter(options: any): any[];
    clear?(): void;
    pause?(): void;
    resume?(): void;
  };
}

/** Registry for queue factories */
export interface IQueueFactoryRegistry {
  /** Register a queue factory */
  register(name: string, factory: IQueueFactory): void;
  
  /** Get a factory by name */
  get(name: string): IQueueFactory | undefined;
  
  /** List all registered factory names */
  list(): string[];
  
  /** Get default factory name */
  getDefault(): string;
  
  /** Set default factory name */
  setDefault(name: string): void;
}

/** Built-in queue types */
export enum QueueType {
  /** No queuing - immediate execution */
  NULL = 'null',
  
  /** p-queue based implementation */
  P_QUEUE = 'p-queue',
  
  /** Custom implementation */
  CUSTOM = 'custom'
}