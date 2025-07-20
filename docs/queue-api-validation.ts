// Queue API Design Validation Examples
// This file demonstrates the proposed API with concrete examples
// Note: This is for design validation only - implementation comes later

import { ProcessManager } from '../src/core/ProcessManager';

// Example 1: Backward Compatibility
// Existing code continues to work unchanged
function example1_BackwardCompatibility() {
  const manager = new ProcessManager();
  
  // This should work exactly as before - no queue
  const info = manager.start({
    cmd: ['echo', 'hello'],
    logDir: 'logs'
  });
  
  // Should return immediately with running status
  console.assert(info.status === 'running');
  console.assert(typeof info.pid === 'number');
}

// Example 2: Basic Concurrency Limiting
function example2_BasicConcurrency() {
  const manager = new ProcessManager({
    queue: { concurrency: 3 }
  });
  
  // Start 10 tasks - only 3 should run concurrently
  const tasks = [];
  for (let i = 0; i < 10; i++) {
    tasks.push(manager.start({
      cmd: ['sleep', '1'],
      logDir: 'logs'
    }));
  }
  
  // Queue should be active
  console.assert(manager.queue !== undefined);
  console.assert(manager.queue!.stats().pending <= 3);
}

// Example 3: Runtime Configuration
function example3_RuntimeConfig() {
  const manager = new ProcessManager();
  
  // Initially no queue
  console.assert(manager.queue === undefined);
  
  // Enable queue at runtime
  manager.setQueueOptions({ 
    concurrency: 5,
    emitQueueEvents: true 
  });
  
  // Now queue should be available
  console.assert(manager.queue !== undefined);
  console.assert(manager.getQueueOptions().concurrency === 5);
}

// Example 4: Priority-Based Execution
function example4_Priority() {
  const manager = new ProcessManager({
    queue: { concurrency: 1 }
  });
  
  // Add tasks with different priorities
  const lowPriority = manager.start({
    cmd: ['low-priority-task'],
    logDir: 'logs',
    queue: { priority: 1 }
  });
  
  const highPriority = manager.start({
    cmd: ['high-priority-task'],
    logDir: 'logs',
    queue: { priority: 100 }
  });
  
  // High priority should execute first
  // (verification would happen in actual implementation)
}

// Example 5: Immediate Execution
function example5_ImmediateExecution() {
  const manager = new ProcessManager({
    queue: { concurrency: 1 }
  });
  
  // Fill the queue
  manager.start({
    cmd: ['blocking-task'],
    logDir: 'logs'
  });
  
  // This should bypass the queue
  const urgentTask = manager.start({
    cmd: ['urgent-task'],
    logDir: 'logs',
    queue: { immediate: true }
  });
  
  // Should start immediately despite queue
  console.assert(urgentTask.status === 'running');
}

// Example 6: Rate Limiting
function example6_RateLimiting() {
  const manager = new ProcessManager();
  
  manager.setQueueOptions({
    interval: 60000,    // 1 minute
    intervalCap: 10     // Max 10 tasks per minute
  });
  
  // Start many tasks quickly
  for (let i = 0; i < 20; i++) {
    manager.start({
      cmd: ['rate-limited-task', i.toString()],
      logDir: 'logs'
    });
  }
  
  // Should respect rate limit
  const stats = manager.queue!.stats();
  console.assert(stats.pending <= 10);
}

// Example 7: Queue Management
async function example7_QueueManagement() {
  const manager = new ProcessManager({
    queue: { concurrency: 2 }
  });
  
  const queue = manager.queue!;
  
  // Add some tasks
  manager.start({ cmd: ['task1'], logDir: 'logs' });
  manager.start({ cmd: ['task2'], logDir: 'logs' });
  manager.start({ cmd: ['task3'], logDir: 'logs' });
  
  // Check queue state
  console.log('Queue stats:', queue.stats());
  
  // Pause processing
  queue.pause();
  console.assert(queue.stats().paused === true);
  
  // Wait for current tasks to finish
  await queue.onIdle();
  
  // Resume processing
  queue.resume();
  console.assert(queue.stats().paused === false);
}

// Example 8: Queue Events
function example8_QueueEvents() {
  const manager = new ProcessManager({
    queue: { 
      concurrency: 2,
      emitQueueEvents: true 
    }
  });
  
  // Listen for queue events
  manager.on('queue:add', (task) => {
    console.log('Task added to queue:', task.id);
  });
  
  manager.on('queue:active', (task) => {
    console.log('Task started executing:', task.id);
  });
  
  manager.on('queue:completed', (task) => {
    console.log('Task completed:', task.id);
  });
  
  manager.on('queue:idle', () => {
    console.log('Queue is now idle');
  });
  
  // Add tasks to trigger events
  manager.start({ cmd: ['event-task'], logDir: 'logs' });
}

// Example 9: Task Cancellation
async function example9_TaskCancellation() {
  const manager = new ProcessManager({
    queue: { concurrency: 1 }
  });
  
  const controller = new AbortController();
  
  const task = manager.start({
    cmd: ['long-running-task'],
    logDir: 'logs',
    queue: { signal: controller.signal }
  });
  
  // Cancel after 5 seconds
  setTimeout(() => {
    controller.abort();
  }, 5000);
  
  try {
    await task;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Task was cancelled');
    }
  }
}

// Example 10: Priority Adjustment
function example10_PriorityAdjustment() {
  const manager = new ProcessManager({
    queue: { concurrency: 1 }
  });
  
  // Add task with ID for later adjustment
  manager.start({
    cmd: ['adjustable-task'],
    logDir: 'logs',
    queue: { 
      priority: 1,
      id: 'my-task' 
    }
  });
  
  // Add more tasks
  manager.start({
    cmd: ['other-task'],
    logDir: 'logs',
    queue: { priority: 5 }
  });
  
  // Increase priority of first task
  manager.queue!.setPriority('my-task', 10);
  
  // Should now execute before other-task
}

// Example 11: Custom Queue Implementation
function example11_CustomQueue() {
  class PriorityQueue {
    private _queue: any[] = [];
    
    enqueue(task: any, options?: any) {
      this._queue.push({ task, options });
      this._queue.sort((a, b) => (b.options?.priority || 0) - (a.options?.priority || 0));
    }
    
    dequeue() {
      return this._queue.shift()?.task;
    }
    
    get size() {
      return this._queue.length;
    }
    
    filter(options: any) {
      return this._queue.filter(item => 
        Object.entries(options).every(([key, value]) => 
          item.options?.[key] === value
        )
      );
    }
  }
  
  const manager = new ProcessManager({
    queue: {
      queueClass: PriorityQueue,
      concurrency: 3
    }
  });
  
  // Uses custom priority queue implementation
  manager.start({
    cmd: ['custom-queue-task'],
    logDir: 'logs',
    queue: { priority: 5 }
  });
}

// Example 12: Metadata and Filtering
function example12_MetadataFiltering() {
  const manager = new ProcessManager({
    queue: { concurrency: 5 }
  });
  
  // Add tasks with metadata
  manager.start({
    cmd: ['analytics-task'],
    logDir: 'logs',
    queue: {
      metadata: { 
        type: 'analytics',
        user: 'admin',
        department: 'engineering'
      }
    }
  });
  
  manager.start({
    cmd: ['user-task'],
    logDir: 'logs',
    queue: {
      metadata: { 
        type: 'user-request',
        user: 'john',
        department: 'sales'
      }
    }
  });
  
  // Count analytics tasks
  const analyticsCount = manager.queue!.sizeBy({ 
    metadata: { type: 'analytics' } 
  });
  
  console.log('Analytics tasks in queue:', analyticsCount);
}

// Example 13: Complex Workflow
async function example13_ComplexWorkflow() {
  const manager = new ProcessManager({
    queue: { 
      concurrency: 1,  // Sequential processing
      emitQueueEvents: true
    }
  });
  
  // Add steps in reverse priority order for proper sequencing
  const step3 = manager.start({
    cmd: ['workflow-step-3'],
    logDir: 'logs',
    queue: { priority: 1, id: 'step3' }
  });
  
  const step2 = manager.start({
    cmd: ['workflow-step-2'],
    logDir: 'logs',
    queue: { priority: 2, id: 'step2' }
  });
  
  const step1 = manager.start({
    cmd: ['workflow-step-1'],
    logDir: 'logs',
    queue: { priority: 3, id: 'step1' }
  });
  
  // Wait for all steps to complete
  await Promise.all([step1, step2, step3]);
  
  console.log('Workflow completed');
}

// Example 14: Error Handling
async function example14_ErrorHandling() {
  const manager = new ProcessManager({
    queue: { 
      concurrency: 2,
      emitQueueEvents: true
    }
  });
  
  manager.on('queue:error', (task, error) => {
    console.error('Task failed:', task.id, error);
  });
  
  try {
    // This should fail
    await manager.start({
      cmd: ['nonexistent-command'],
      logDir: 'logs'
    });
  } catch (error) {
    console.log('Caught task error:', error.message);
  }
  
  // Queue should continue processing other tasks
  const successTask = manager.start({
    cmd: ['echo', 'success'],
    logDir: 'logs'
  });
  
  await successTask;
}

// Example 15: Feature Detection
function example15_FeatureDetection() {
  const manager = new ProcessManager();
  
  // Check if queue features are available
  if (manager.supportsQueue?.()) {
    // Enable queue features safely
    manager.setQueueOptions({ concurrency: 5 });
    
    console.log('Queue features enabled');
  } else {
    // Fall back to immediate execution
    console.log('Queue features not available, using immediate execution');
  }
  
  // This pattern allows gradual migration
  const task = manager.start({
    cmd: ['adaptive-task'],
    logDir: 'logs',
    // Queue options ignored if not supported
    queue: { priority: 5 }
  });
}

// API Completeness Validation
function validateAPICompleteness() {
  const manager = new ProcessManager();
  
  // Constructor with queue options
  const queuedManager = new ProcessManager({
    queue: {
      concurrency: 5,
      interval: 1000,
      intervalCap: 10,
      autoStart: true,
      emitQueueEvents: true,
      timeout: 30000,
      throwOnTimeout: true
    }
  });
  
  // Runtime configuration
  manager.setQueueOptions({ concurrency: 3 });
  const options = manager.getQueueOptions();
  
  // Queue access
  const queue = manager.queue;
  
  if (queue) {
    // Queue management
    queue.pause();
    queue.resume();
    queue.clear();
    
    // Queue state
    const stats = queue.stats();
    const idle = queue.isIdle();
    const empty = queue.isEmpty();
    
    // Queue waiting
    queue.onEmpty();
    queue.onIdle();
    queue.onSizeLessThan(5);
    
    // Queue filtering
    const count = queue.sizeBy({ priority: 5 });
    
    // Priority adjustment
    queue.setPriority('task-id', 10);
  }
  
  // Task options
  manager.start({
    cmd: ['comprehensive-task'],
    logDir: 'logs',
    queue: {
      immediate: true,
      priority: 5,
      timeout: 10000,
      id: 'unique-task',
      metadata: { type: 'test' },
      signal: new AbortController().signal
    }
  });
  
  // Feature detection
  const hasQueue = manager.supportsQueue?.();
  
  console.log('API validation complete - all features accessible');
}

export {
  example1_BackwardCompatibility,
  example2_BasicConcurrency,
  example3_RuntimeConfig,
  example4_Priority,
  example5_ImmediateExecution,
  example6_RateLimiting,
  example7_QueueManagement,
  example8_QueueEvents,
  example9_TaskCancellation,
  example10_PriorityAdjustment,
  example11_CustomQueue,
  example12_MetadataFiltering,
  example13_ComplexWorkflow,
  example14_ErrorHandling,
  example15_FeatureDetection,
  validateAPICompleteness
};