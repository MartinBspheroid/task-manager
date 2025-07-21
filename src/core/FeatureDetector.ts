// src/core/FeatureDetector.ts

import type { QueueOptions } from './types';
import type { IQueue } from './interfaces/IQueue';

/**
 * Feature detection utilities for ProcessManager capabilities
 * Enables code to detect and adapt to available features
 */
export class FeatureDetector {
  
  /**
   * Check if queue features are supported
   * Always true in v2.0+, but allows for graceful degradation
   */
  static supportsQueue(): boolean {
    return true;
  }
  
  /**
   * Check if queuing is enabled based on configuration
   */
  static isQueuingEnabled(queueOptions: QueueOptions): boolean {
    // Queuing is enabled if concurrency is limited
    if (typeof queueOptions.concurrency === 'number' && queueOptions.concurrency < Infinity) {
      return true;
    }
    
    // Or if rate limiting is configured
    if (queueOptions.interval && queueOptions.intervalCap) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if rate limiting is enabled
   */
  static isRateLimitingEnabled(queueOptions: QueueOptions): boolean {
    return !!(queueOptions.interval && queueOptions.intervalCap);
  }
  
  /**
   * Check if queue events will be emitted
   */
  static areQueueEventsEnabled(queueOptions: QueueOptions): boolean {
    return this.isQueuingEnabled(queueOptions) && !!queueOptions.emitQueueEvents;
  }
  
  /**
   * Check if priority queuing is available
   */
  static supportsPriorityQueuing(queue: IQueue): boolean {
    return typeof queue.setPriority === 'function';
  }
  
  /**
   * Check if queue can be paused/resumed
   */
  static supportsPauseResume(queue: IQueue): boolean {
    return typeof queue.pause === 'function' && typeof queue.resume === 'function';
  }
  
  /**
   * Check if queue supports cancellation
   */
  static supportsCancellation(queue: IQueue): boolean {
    // Check if queue accepts AbortSignal in options
    return true; // All our implementations support this
  }
  
  /**
   * Check if queue supports custom metadata
   */
  static supportsMetadata(queue: IQueue): boolean {
    return typeof queue.sizeBy === 'function';
  }
  
  /**
   * Get available queue features
   */
  static getQueueFeatures(queue: IQueue): QueueFeature[] {
    const features: QueueFeature[] = [];
    
    // Basic queuing is always supported
    features.push(QueueFeature.BASIC_QUEUING);
    
    if (this.supportsPriorityQueuing(queue)) {
      features.push(QueueFeature.PRIORITY);
    }
    
    if (this.supportsPauseResume(queue)) {
      features.push(QueueFeature.PAUSE_RESUME);
    }
    
    if (this.supportsCancellation(queue)) {
      features.push(QueueFeature.CANCELLATION);
    }
    
    if (this.supportsMetadata(queue)) {
      features.push(QueueFeature.METADATA);
    }
    
    // Check for async wait capabilities
    if (typeof queue.onEmpty === 'function') {
      features.push(QueueFeature.ASYNC_WAIT);
    }
    
    // Check for statistics (all our implementations have this)
    features.push(QueueFeature.STATISTICS);
    
    return features;
  }
  
  /**
   * Get execution mode description
   */
  static getExecutionMode(queueOptions: QueueOptions): ExecutionMode {
    if (!this.isQueuingEnabled(queueOptions)) {
      return {
        type: 'immediate',
        description: 'Tasks execute immediately without queuing',
        features: ['unlimited_concurrency', 'immediate_start'],
        compatible: true
      };
    }
    
    const features: string[] = ['queuing'];
    
    if (typeof queueOptions.concurrency === 'number') {
      features.push(`concurrency_${queueOptions.concurrency}`);
    }
    
    if (this.isRateLimitingEnabled(queueOptions)) {
      features.push('rate_limiting');
    }
    
    if (queueOptions.emitQueueEvents) {
      features.push('events');
    }
    
    return {
      type: 'queued',
      description: 'Tasks are queued and executed with limits',
      features,
      compatible: false // Different from v1.x behavior
    };
  }
  
  /**
   * Check if configuration is backward compatible
   */
  static isBackwardCompatible(queueOptions: QueueOptions): boolean {
    return !this.isQueuingEnabled(queueOptions);
  }
  
  /**
   * Get compatibility level
   */
  static getCompatibilityLevel(queueOptions: QueueOptions): CompatibilityLevel {
    if (this.isBackwardCompatible(queueOptions)) {
      return {
        level: 'full',
        description: 'Fully compatible with v1.x behavior',
        notes: []
      };
    }
    
    const notes: string[] = [];
    
    if (typeof queueOptions.concurrency === 'number' && queueOptions.concurrency < Infinity) {
      notes.push('Concurrency limits may delay task execution');
    }
    
    if (this.isRateLimitingEnabled(queueOptions)) {
      notes.push('Rate limiting may delay task execution');
    }
    
    if (queueOptions.emitQueueEvents) {
      notes.push('Additional queue events will be emitted');
    }
    
    return {
      level: 'partial',
      description: 'Some behavior changes due to queue configuration',
      notes
    };
  }
  
  /**
   * Create feature detection object for use in conditional code
   */
  static createFeatureSet(queueOptions: QueueOptions, queue: IQueue): FeatureSet {
    return {
      supportsQueue: true,
      isQueuingEnabled: this.isQueuingEnabled(queueOptions),
      isRateLimitingEnabled: this.isRateLimitingEnabled(queueOptions),
      areEventsEnabled: this.areQueueEventsEnabled(queueOptions),
      queueFeatures: this.getQueueFeatures(queue),
      executionMode: this.getExecutionMode(queueOptions),
      compatibilityLevel: this.getCompatibilityLevel(queueOptions),
      isBackwardCompatible: this.isBackwardCompatible(queueOptions)
    };
  }
}

/** Available queue features */
export enum QueueFeature {
  BASIC_QUEUING = 'basic_queuing',
  PRIORITY = 'priority',
  PAUSE_RESUME = 'pause_resume',
  CANCELLATION = 'cancellation',
  METADATA = 'metadata',
  ASYNC_WAIT = 'async_wait',
  STATISTICS = 'statistics',
  RATE_LIMITING = 'rate_limiting',
  EVENTS = 'events'
}

/** Execution mode information */
export interface ExecutionMode {
  /** Type of execution */
  type: 'immediate' | 'queued';
  
  /** Human-readable description */
  description: string;
  
  /** List of enabled features */
  features: string[];
  
  /** Whether this mode is compatible with v1.x */
  compatible: boolean;
}

/** Compatibility level information */
export interface CompatibilityLevel {
  /** Level of compatibility */
  level: 'full' | 'partial' | 'none';
  
  /** Description of compatibility */
  description: string;
  
  /** Notes about potential differences */
  notes: string[];
}

/** Complete feature set for conditional programming */
export interface FeatureSet {
  /** Whether queue features are supported */
  supportsQueue: boolean;
  
  /** Whether queuing is currently enabled */
  isQueuingEnabled: boolean;
  
  /** Whether rate limiting is enabled */
  isRateLimitingEnabled: boolean;
  
  /** Whether queue events are enabled */
  areEventsEnabled: boolean;
  
  /** Available queue features */
  queueFeatures: QueueFeature[];
  
  /** Current execution mode */
  executionMode: ExecutionMode;
  
  /** Compatibility level */
  compatibilityLevel: CompatibilityLevel;
  
  /** Whether fully backward compatible */
  isBackwardCompatible: boolean;
}

/**
 * Utility functions for common feature detection patterns
 */
export class FeatureUtils {
  
  /**
   * Check if it's safe to use synchronous API expecting immediate execution
   */
  static canUseImmediateAPI(features: FeatureSet): boolean {
    return features.isBackwardCompatible;
  }
  
  /**
   * Check if async API should be preferred
   */
  static shouldUseAsyncAPI(features: FeatureSet): boolean {
    return features.isQueuingEnabled;
  }
  
  /**
   * Check if code should handle 'queued' status
   */
  static shouldHandleQueuedStatus(features: FeatureSet): boolean {
    return features.isQueuingEnabled;
  }
  
  /**
   * Check if queue management methods are available
   */
  static canManageQueue(features: FeatureSet): boolean {
    return features.queueFeatures.includes(QueueFeature.PAUSE_RESUME);
  }
  
  /**
   * Check if priority can be adjusted
   */
  static canAdjustPriority(features: FeatureSet): boolean {
    return features.queueFeatures.includes(QueueFeature.PRIORITY);
  }
  
  /**
   * Get recommended usage pattern
   */
  static getRecommendedPattern(features: FeatureSet): UsagePattern {
    if (features.isBackwardCompatible) {
      return {
        pattern: 'sync',
        description: 'Use synchronous API for immediate execution',
        example: 'const task = manager.start(opts);'
      };
    }
    
    if (features.isQueuingEnabled) {
      return {
        pattern: 'async',
        description: 'Use async API for queue-aware execution',
        example: 'const task = await manager.startAsync(opts);'
      };
    }
    
    return {
      pattern: 'hybrid',
      description: 'Use feature detection for conditional behavior',
      example: 'const task = features.canUseImmediateAPI() ? manager.start(opts) : await manager.startAsync(opts);'
    };
  }
}

/** Recommended usage pattern */
export interface UsagePattern {
  /** Pattern type */
  pattern: 'sync' | 'async' | 'hybrid';
  
  /** Description of when to use this pattern */
  description: string;
  
  /** Code example */
  example: string;
}