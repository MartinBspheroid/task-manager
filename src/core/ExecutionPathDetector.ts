// src/core/ExecutionPathDetector.ts

import type { 
  IExecutionPathDetector
} from './interfaces/IProcessManager';
import { ExecutionStrategy } from './interfaces/IProcessManager';
import type { QueueOptions, TaskQueueOptions } from './types';

/**
 * Determines execution strategy based on configuration
 * Ensures backward compatibility by defaulting to immediate execution
 */
export class ExecutionPathDetector implements IExecutionPathDetector {
  
  getExecutionStrategy(
    queueOptions: QueueOptions,
    taskOptions?: TaskQueueOptions
  ): ExecutionStrategy {
    
    // Task-level immediate override (highest priority)
    if (taskOptions?.immediate === true) {
      return ExecutionStrategy.IMMEDIATE;
    }
    
    // Check if queuing is effectively disabled
    if (this.isQueuingDisabled(queueOptions)) {
      return ExecutionStrategy.IMMEDIATE;
    }
    
    // Queuing is enabled and not overridden
    return ExecutionStrategy.QUEUED;
  }
  
  isQueuingDisabled(queueOptions: QueueOptions): boolean {
    // Queuing is disabled if:
    
    // 1. Concurrency is infinite (default v1.x behavior)
    if (queueOptions.concurrency === Infinity || queueOptions.concurrency === undefined) {
      // Additional rate limiting checks
      const hasRateLimiting = (
        queueOptions.interval !== undefined && 
        queueOptions.intervalCap !== undefined &&
        queueOptions.intervalCap > 0
      );
      
      // If no rate limiting, queuing is disabled
      if (!hasRateLimiting) {
        return true;
      }
    }
    
    // 2. Concurrency is set to a very high number (effectively infinite)
    if (typeof queueOptions.concurrency === 'number' && queueOptions.concurrency >= 10000) {
      return true;
    }
    
    // 3. AutoStart is disabled (would prevent execution)
    if (queueOptions.autoStart === false) {
      // This is a configuration issue, but we'll treat as immediate for compatibility
      return true;
    }
    
    // Queuing is enabled
    return false;
  }
  
  shouldBypassQueue(
    queueOptions: QueueOptions,
    taskOptions?: TaskQueueOptions
  ): boolean {
    
    // Explicit immediate flag
    if (taskOptions?.immediate === true) {
      return true;
    }
    
    // Queue is disabled globally
    if (this.isQueuingDisabled(queueOptions)) {
      return true;
    }
    
    // High priority tasks might bypass queue in some implementations
    // For now, we don't bypass based on priority alone
    
    return false;
  }
  
  /**
   * Get a human-readable explanation of the execution decision
   */
  getExecutionReason(
    queueOptions: QueueOptions,
    taskOptions?: TaskQueueOptions
  ): string {
    
    if (taskOptions?.immediate === true) {
      return 'Task has immediate=true flag';
    }
    
    if (queueOptions.concurrency === Infinity || queueOptions.concurrency === undefined) {
      const hasRateLimiting = (
        queueOptions.interval !== undefined && 
        queueOptions.intervalCap !== undefined
      );
      
      if (!hasRateLimiting) {
        return 'Infinite concurrency with no rate limiting (v1.x compatibility mode)';
      } else {
        return 'Infinite concurrency but rate limiting enabled';
      }
    }
    
    if (typeof queueOptions.concurrency === 'number' && queueOptions.concurrency >= 10000) {
      return `Very high concurrency limit (${queueOptions.concurrency}) - effectively unlimited`;
    }
    
    if (queueOptions.autoStart === false) {
      return 'AutoStart disabled - falling back to immediate execution';
    }
    
    return `Queue enabled with concurrency=${queueOptions.concurrency}`;
  }
  
  /**
   * Validate that configuration will result in expected behavior
   */
  validateConfiguration(
    queueOptions: QueueOptions,
    expectedStrategy: ExecutionStrategy
  ): { valid: boolean; issues: string[] } {
    
    const actualStrategy = this.getExecutionStrategy(queueOptions);
    const issues: string[] = [];
    
    if (actualStrategy !== expectedStrategy) {
      issues.push(
        `Expected ${expectedStrategy} execution but configuration results in ${actualStrategy}`
      );
    }
    
    // Check for potentially confusing configurations
    if (expectedStrategy === ExecutionStrategy.IMMEDIATE) {
      if (queueOptions.concurrency !== undefined && queueOptions.concurrency !== Infinity) {
        issues.push(
          'Concurrency limit set but will be ignored due to infinite effective concurrency'
        );
      }
      
      if (queueOptions.emitQueueEvents === true) {
        issues.push(
          'Queue events enabled but queue is disabled - events will not fire'
        );
      }
    }
    
    if (expectedStrategy === ExecutionStrategy.QUEUED) {
      if (queueOptions.concurrency === undefined) {
        issues.push(
          'Queue strategy expected but no concurrency limit set'
        );
      }
      
      if (queueOptions.autoStart === false) {
        issues.push(
          'Queue strategy expected but autoStart is disabled'
        );
      }
    }
    
    // Rate limiting validation
    const hasInterval = queueOptions.interval !== undefined;
    const hasIntervalCap = queueOptions.intervalCap !== undefined;
    
    if (hasInterval && !hasIntervalCap) {
      issues.push(
        'Rate limiting interval set but no intervalCap specified'
      );
    }
    
    if (!hasInterval && hasIntervalCap) {
      issues.push(
        'Rate limiting intervalCap set but no interval specified'
      );
    }
    
    if (hasInterval && hasIntervalCap) {
      if (queueOptions.interval! <= 0) {
        issues.push(
          'Rate limiting interval must be positive'
        );
      }
      
      if (queueOptions.intervalCap! <= 0) {
        issues.push(
          'Rate limiting intervalCap must be positive'
        );
      }
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }
  
  /**
   * Get default queue options that preserve v1.x behavior
   */
  static getV1CompatibleOptions(): QueueOptions {
    return {
      concurrency: Infinity,
      autoStart: true,
      emitQueueEvents: false,
      throwOnTimeout: true
    };
  }
  
  /**
   * Get queue options for enabling basic queuing
   */
  static getBasicQueueOptions(concurrency: number = 5): QueueOptions {
    return {
      concurrency,
      autoStart: true,
      emitQueueEvents: false,
      throwOnTimeout: true
    };
  }
  
  /**
   * Get queue options with rate limiting
   */
  static getRateLimitedOptions(
    intervalMs: number = 60000, 
    maxPerInterval: number = 10
  ): QueueOptions {
    return {
      concurrency: Infinity,
      interval: intervalMs,
      intervalCap: maxPerInterval,
      autoStart: true,
      emitQueueEvents: false,
      throwOnTimeout: true
    };
  }
}