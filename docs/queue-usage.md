# Queue Usage Guide

## When to Use Queuing

Queue functionality is beneficial when you need to:

### Resource Management
- **Limit concurrent processes** to avoid overwhelming the system
- **Control memory usage** during batch operations
- **Prevent file handle exhaustion** when processing many files
- **Manage CPU-intensive tasks** that could starve other processes

### Load Control
- **Rate limiting** API calls or external service requests
- **Backpressure handling** when downstream systems are slow
- **Burst management** during traffic spikes
- **Graceful degradation** under high load

### Task Orchestration
- **Priority scheduling** for urgent vs background tasks
- **Batch processing** with controlled parallelism
- **Maintenance windows** using pause/resume
- **Sequential processing** when tasks have dependencies

## Queue Configuration Examples

### Basic Concurrency Control

```typescript
// Limit to 4 concurrent tasks
const manager = new ProcessManager({
  queue: { concurrency: 4 }
});

// Tasks beyond 4 will queue automatically
for (let i = 0; i < 10; i++) {
  manager.start({ 
    cmd: ['process-file', `file-${i}.txt`],
    logDir: './logs'
  });
}
// First 4 start immediately, others queue
```

### Priority-Based Processing

```typescript
const manager = new ProcessManager({
  queue: { concurrency: 2 }
});

// High priority (urgent customer requests)
manager.start({
  cmd: ['handle-payment', 'customer-123'],
  logDir: './logs',
  queue: { priority: PRIORITY.HIGH }
});

// Normal priority (routine processing)
manager.start({
  cmd: ['generate-report', 'daily'],
  logDir: './logs'
  // priority defaults to 0 (NORMAL)
});

// Background priority (cleanup tasks)
manager.start({
  cmd: ['cleanup-temp-files'],
  logDir: './logs',
  queue: { priority: PRIORITY.BATCH }
});
```

### Rate Limiting

```typescript
// Limit to 10 API calls per minute
const manager = new ProcessManager({
  queue: {
    concurrency: 3,
    interval: 60 * 1000,    // 1 minute in ms
    intervalCap: 10         // Max 10 tasks per interval
  }
});

// API calls are automatically throttled
for (const user of users) {
  manager.start({
    cmd: ['sync-user-data', user.id],
    logDir: './logs'
  });
}
```

### Emergency Immediate Execution

```typescript
const manager = new ProcessManager({
  queue: { concurrency: 1 } // Very limited capacity
});

// Fill up the queue
manager.start({ cmd: ['long-running-task-1'], logDir: './logs' });
manager.start({ cmd: ['long-running-task-2'], logDir: './logs' }); // Queued

// Emergency task bypasses queue completely
manager.startImmediate({
  cmd: ['emergency-handler', 'critical-alert'],
  logDir: './logs'
});
// Starts immediately despite queue being full
```

## Best Practices

### Choosing Concurrency Limits

```typescript
// CPU-intensive tasks
const cpuManager = new ProcessManager({
  queue: { concurrency: os.cpus().length }
});

// I/O-bound tasks
const ioManager = new ProcessManager({
  queue: { concurrency: os.cpus().length * 4 }
});

// External API calls (respect rate limits)
const apiManager = new ProcessManager({
  queue: { 
    concurrency: 2,
    interval: 1000,
    intervalCap: 5
  }
});
```

### Error Handling in Queued Systems

```typescript
const manager = new ProcessManager({
  queue: { concurrency: 3 }
});

// Handle individual task failures
manager.registerGlobalHooks({
  onFailure: [(taskInfo) => {
    console.error(`Task ${taskInfo.id} failed:`, taskInfo.exitCode);
    // Maybe retry or alert
  }],
  
  onTaskStartFail: [(taskInfo) => {
    console.error(`Failed to start task:`, taskInfo.startError);
    // Handle spawn failures
  }]
});

// Monitor queue health
setInterval(() => {
  const stats = manager.getQueueStats();
  if (stats.utilization > 90) {
    console.warn('Queue utilization high:', stats);
  }
}, 5000);
```

### Graceful Shutdown

```typescript
// Production-ready shutdown handling
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  
  // Stop accepting new tasks
  manager.pauseQueue();
  
  // Wait for current tasks to complete (with timeout)
  try {
    await manager.waitForQueueIdle();
    console.log('All tasks completed');
  } catch (error) {
    console.log('Timeout reached, force killing remaining tasks');
    manager.killAll();
  }
  
  process.exit(0);
});
```

## Performance Tuning

### Monitoring Queue Performance

```typescript
const manager = new ProcessManager({
  queue: { concurrency: 4 }
});

// Regular performance monitoring
setInterval(() => {
  const stats = manager.getQueueStats();
  
  console.log({
    queueSize: stats.size,
    running: stats.pending,
    throughput: stats.throughput,
    avgWaitTime: stats.averageWaitTime,
    utilization: stats.utilization
  });
  
  // Dynamic scaling based on metrics
  if (stats.averageWaitTime > 30000) { // 30 seconds
    console.log('Increasing concurrency due to high wait times');
    manager.setQueueConcurrency(stats.pending + 2);
  }
}, 10000);
```

### Memory Management

```typescript
// Process large datasets in chunks
async function processBigDataset(files: string[]) {
  const manager = new ProcessManager({
    queue: { concurrency: 2 } // Limit memory usage
  });
  
  // Process in chunks to avoid memory buildup
  const chunkSize = 100;
  for (let i = 0; i < files.length; i += chunkSize) {
    const chunk = files.slice(i, i + chunkSize);
    
    // Start chunk
    const tasks = chunk.map(file => 
      manager.startWithHandle({
        cmd: ['process-large-file', file],
        logDir: './logs'
      })
    );
    
    // Wait for chunk completion before next chunk
    await Promise.all(tasks.map(t => t.onCompleted()));
    
    console.log(`Processed chunk ${Math.floor(i/chunkSize) + 1}`);
  }
}
```

## Advanced Patterns

### Task Dependencies

```typescript
// Sequential processing with dependencies
async function processWithDependencies() {
  const manager = new ProcessManager({
    queue: { concurrency: 1 } // Sequential processing
  });
  
  // Step 1: Data extraction
  const extractTask = await manager.startAndWait({
    cmd: ['extract-data', 'source.csv'],
    logDir: './logs'
  });
  
  if (extractTask.exitCode !== 0) {
    throw new Error('Data extraction failed');
  }
  
  // Step 2: Data transformation (depends on step 1)
  const transformTask = await manager.startAndWait({
    cmd: ['transform-data', 'extracted.json'],
    logDir: './logs'
  });
  
  // Step 3: Data loading (depends on step 2)
  await manager.startAndWait({
    cmd: ['load-data', 'transformed.json'],
    logDir: './logs'
  });
}
```

### Fan-out/Fan-in Processing

```typescript
// Parallel processing with aggregation
async function fanOutFanIn(inputFiles: string[]) {
  const manager = new ProcessManager({
    queue: { concurrency: 4 }
  });
  
  // Fan-out: Process all files in parallel
  const processingTasks = inputFiles.map(file =>
    manager.startWithHandle({
      cmd: ['process-file', file],
      logDir: './logs'
    })
  );
  
  // Wait for all to complete
  const results = await Promise.all(
    processingTasks.map(task => task.onCompleted())
  );
  
  // Check for failures
  const failures = results.filter(r => r.exitCode !== 0);
  if (failures.length > 0) {
    console.error(`${failures.length} tasks failed`);
  }
  
  // Fan-in: Aggregate results
  await manager.startAndWait({
    cmd: ['aggregate-results', 'output/'],
    logDir: './logs'
  });
}
```

### Health Monitoring

```typescript
// Comprehensive health monitoring
class QueueHealthMonitor {
  private manager: ProcessManager;
  private alertThresholds = {
    highUtilization: 90,
    longWaitTime: 60000,    // 1 minute
    lowThroughput: 0.1      // tasks per second
  };
  
  constructor(manager: ProcessManager) {
    this.manager = manager;
    this.startMonitoring();
  }
  
  private startMonitoring() {
    setInterval(() => {
      const health = this.manager.getHealth();
      const stats = this.manager.getQueueStats();
      
      // Alert on health issues
      if (health.status === 'unhealthy') {
        this.sendAlert('CRITICAL', `Queue unhealthy: ${health.issues.join(', ')}`);
      }
      
      // Alert on performance issues  
      if (stats.utilization > this.alertThresholds.highUtilization) {
        this.sendAlert('WARNING', `High queue utilization: ${stats.utilization}%`);
      }
      
      if (stats.averageWaitTime > this.alertThresholds.longWaitTime) {
        this.sendAlert('WARNING', `Long average wait time: ${stats.averageWaitTime}ms`);
      }
      
      if (stats.throughput < this.alertThresholds.lowThroughput) {
        this.sendAlert('WARNING', `Low throughput: ${stats.throughput} tasks/sec`);
      }
      
    }, 30000); // Check every 30 seconds
  }
  
  private sendAlert(level: string, message: string) {
    console.log(`[${level}] ${new Date().toISOString()}: ${message}`);
    // Integrate with your alerting system here
  }
}

// Usage
const manager = new ProcessManager({ queue: { concurrency: 4 } });
const monitor = new QueueHealthMonitor(manager);
```

## Troubleshooting

### Common Issues

#### Tasks Stuck in Queue
```typescript
// Diagnose queue issues
const stats = manager.getQueueStats();
console.log({
  queueSize: stats.size,        // Tasks waiting
  running: stats.pending,       // Tasks running
  paused: stats.paused,        // Is queue paused?
  concurrency: manager.getQueueConcurrency()
});

// Solutions:
// 1. Increase concurrency
manager.setQueueConcurrency(8);

// 2. Resume if paused
if (manager.isQueuePaused()) {
  manager.resumeQueue();
}

// 3. Clear stuck tasks
manager.clearQueue(); // Removes pending tasks
```

#### Memory Leaks
```typescript
// Monitor memory usage
setInterval(() => {
  const memory = process.memoryUsage();
  const stats = manager.getQueueStats();
  
  console.log({
    heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
    queueSize: stats.size,
    totalTasks: stats.totalAdded
  });
  
  // Clean up completed tasks if needed
  if (memory.heapUsed > 1000 * 1024 * 1024) { // 1GB
    console.warn('High memory usage detected');
    // Implement cleanup strategy
  }
}, 60000);
```

#### Performance Degradation
```typescript
// Performance debugging
const startTime = Date.now();
let taskCount = 0;

manager.registerGlobalHooks({
  onSuccess: [(taskInfo) => {
    taskCount++;
    const duration = Date.now() - startTime;
    const throughput = taskCount / (duration / 1000);
    
    console.log(`Throughput: ${throughput.toFixed(2)} tasks/sec`);
    
    if (throughput < 1.0) {
      console.warn('Low throughput detected, consider:');
      console.warn('- Increasing concurrency');
      console.warn('- Optimizing task commands');
      console.warn('- Checking system resources');
    }
  }]
});
```

## Migration from Immediate Mode

### Gradual Adoption

```typescript
// Phase 1: Add queue with high concurrency (minimal impact)
const manager = new ProcessManager({
  queue: { concurrency: 100 } // High limit, almost like immediate mode
});

// Phase 2: Gradually reduce concurrency and monitor
setTimeout(() => {
  manager.setQueueConcurrency(50);
}, 60000);

setTimeout(() => {
  manager.setQueueConcurrency(10);
}, 120000);

// Phase 3: Find optimal concurrency for your workload
```

### A/B Testing

```typescript
// Compare immediate vs queued performance
const immediateManager = new ProcessManager(); // No queue
const queuedManager = new ProcessManager({ queue: { concurrency: 4 } });

const testTasks = Array.from({length: 20}, (_, i) => ({
  cmd: ['test-task', `${i}`],
  logDir: './logs'
}));

// Test immediate mode
const immediateStart = Date.now();
const immediateTasks = testTasks.map(opts => immediateManager.start(opts));
await Promise.all(immediateTasks.map(t => waitForExit(t.id)));
const immediateTime = Date.now() - immediateStart;

// Test queued mode  
const queuedStart = Date.now();
const queuedTasks = testTasks.map(opts => queuedManager.start(opts));
await queuedManager.waitForQueueIdle();
const queuedTime = Date.now() - queuedStart;

console.log(`Immediate: ${immediateTime}ms, Queued: ${queuedTime}ms`);
```

This guide provides comprehensive patterns for effective queue usage while maintaining the flexibility to adopt features gradually.