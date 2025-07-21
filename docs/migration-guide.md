# Migration Guide: ProcessManager v1.x to v2.0

## Overview

ProcessManager v2.0 introduces powerful queue functionality while maintaining **100% backward compatibility** with v1.x code. This guide helps you understand your options for migrating to v2.0 and taking advantage of new features.

## 🚀 Quick Start: No Migration Needed

**Your existing v1.x code works unchanged in v2.0:**

```typescript
// This v1.x code works identically in v2.0
const manager = new ProcessManager();
const task = manager.start({ 
  cmd: ['build', 'production'], 
  logDir: 'logs' 
});

console.log(task.status); // 'running' - executes immediately
console.log(task.pid);    // Process ID - already running
```

## 📊 Migration Decision Tree

```
Do you need queue features?
├─ NO  → ✅ No changes needed
│      → Continue using existing code
│
└─ YES → Do you want gradual adoption?
         ├─ YES → 🔄 Gradual Migration (recommended)
         └─ NO  → ⚡ Full Migration
```

## 🔄 Migration Strategies

### Strategy 1: No Changes (95% of users)

**When to use:** You're satisfied with current behavior and don't need queue features.

**What to do:** Nothing! Update to v2.0 and your code continues working.

```typescript
// v1.x code
const manager = new ProcessManager();
const task = manager.start({ cmd: ['task'], logDir: 'logs' });

// v2.0 - identical behavior
const manager = new ProcessManager();
const task = manager.start({ cmd: ['task'], logDir: 'logs' });
```

**Benefits:**
- Zero effort
- Zero risk
- Identical performance
- Future-proof (can enable queue features later)

### Strategy 2: Gradual Migration (Recommended)

**When to use:** You want to gradually adopt queue features without disrupting existing code.

**Phase 1: Enable Feature Detection**
```typescript
// Add feature detection without changing behavior
const manager = new ProcessManager();

// Your existing code
const task = manager.start({ cmd: ['task'], logDir: 'logs' });

// Optional: Add feature detection for future use
if (manager.supportsQueue) {
  console.log('Queue features available');
}
```

**Phase 2: Opt into Basic Queuing**
```typescript
// Enable queuing for new code only
const manager = new ProcessManager({
  queue: { concurrency: 5 }  // Enables queuing
});

// Existing code - now returns 'queued' status when queue is full
const task = manager.start({ cmd: ['task'], logDir: 'logs' });

if (task.status === 'queued') {
  console.log('Task is queued for execution');
} else {
  console.log('Task started immediately');
}
```

**Phase 3: Adopt Async API**
```typescript
// Use async API for better queue integration
const manager = new ProcessManager({
  queue: { concurrency: 5 }
});

// New async approach (recommended for queued mode)
const task = await manager.startAsync({ cmd: ['task'], logDir: 'logs' });
console.log(task.status); // 'running' - waits for execution to start
```

**Phase 4: Full Queue Features**
```typescript
// Use all queue features
const manager = new ProcessManager({
  queue: { 
    concurrency: 5,
    emitQueueEvents: true 
  }
});

// Listen for queue events
manager.on('queue:idle', () => {
  console.log('All tasks completed');
});

// Priority tasks
const highPriorityTask = await manager.startAsync({
  cmd: ['urgent-task'],
  logDir: 'logs',
  queue: { priority: 10 }
});

// Queue management
manager.pauseQueue();
await manager.queue.onEmpty();
manager.resumeQueue();
```

### Strategy 3: Full Migration

**When to use:** You want to immediately adopt all queue features across your application.

**Before (v1.x):**
```typescript
const manager = new ProcessManager();

// Start many tasks - all run simultaneously
const tasks = [];
for (let i = 0; i < 100; i++) {
  tasks.push(manager.start({ 
    cmd: ['task', i.toString()], 
    logDir: 'logs' 
  }));
}
```

**After (v2.0):**
```typescript
const manager = new ProcessManager({
  queue: { 
    concurrency: 10,  // Limit concurrent execution
    emitQueueEvents: true
  }
});

// Start many tasks - queued and executed with limits
const tasks = [];
for (let i = 0; i < 100; i++) {
  tasks.push(manager.startAsync({ 
    cmd: ['task', i.toString()], 
    logDir: 'logs' 
  }));
}

// Wait for all to complete
await Promise.all(tasks);
```

## 🛠️ Common Migration Patterns

### Pattern 1: Wrapper Function

Create a wrapper for gradual migration:

```typescript
// Compatibility wrapper
async function startTask(
  manager: ProcessManager, 
  opts: ProcessTaskOpts
): Promise<TaskInfo> {
  if (manager.isQueuingEnabled()) {
    return manager.startAsync(opts);
  } else {
    return manager.start(opts);
  }
}

// Use everywhere
const task = await startTask(manager, { cmd: ['build'], logDir: 'logs' });
```

### Pattern 2: Feature Detection

Adapt behavior based on available features:

```typescript
function createManager(enableQueue: boolean = false) {
  const manager = new ProcessManager({
    queue: enableQueue ? { concurrency: 5 } : undefined
  });
  
  // Feature detection
  const features = {
    hasQueue: manager.supportsQueue,
    isEnabled: manager.isQueuingEnabled(),
    canPause: typeof manager.pauseQueue === 'function'
  };
  
  return { manager, features };
}

// Usage
const { manager, features } = createManager(true);

if (features.isEnabled) {
  // Use queue-aware API
  const task = await manager.startAsync(opts);
} else {
  // Use immediate API
  const task = manager.start(opts);
}
```

### Pattern 3: Configuration-Based

Use environment or config to control queue behavior:

```typescript
// Configuration-driven approach
const config = {
  production: { queue: { concurrency: 10, emitQueueEvents: true } },
  development: { queue: { concurrency: 3 } },
  test: {} // No queue for fast tests
};

const manager = new ProcessManager(config[process.env.NODE_ENV || 'development']);
```

### Pattern 4: Class Extension

Extend ProcessManager for custom behavior:

```typescript
class EnhancedProcessManager extends ProcessManager {
  constructor(options?: ProcessManagerOptions) {
    super({
      queue: { concurrency: 5 },
      ...options
    });
  }
  
  // Always use async API
  async start(opts: ProcessTaskOpts): Promise<TaskInfo> {
    return this.startAsync(opts);
  }
  
  // Add custom queue management
  async drainQueue(): Promise<void> {
    this.pauseQueue();
    await this.queue.onIdle();
  }
}
```

## ⚠️ Important Considerations

### Performance Impact

**Default Mode (No Queue):**
- ✅ Identical performance to v1.x
- ✅ No memory overhead
- ✅ No execution delays

**Queue Mode:**
- ⚡ Slight overhead for queue management
- 📊 Memory usage increases with queue size
- ⏱️ Tasks may wait for execution slots

### Status Handling

**v1.x Status Values:**
- `'running'` - task is executing
- `'exited'` - task completed
- `'killed'` - task was terminated
- `'timeout'` - task timed out
- `'start-failed'` - spawn failed

**v2.0 Additional Status:**
- `'queued'` - task is waiting in queue (only when queuing enabled)

```typescript
// Handle new status
const task = manager.start({ cmd: ['task'], logDir: 'logs' });

switch (task.status) {
  case 'running':
    console.log('Task started immediately');
    break;
  case 'queued':
    console.log('Task is waiting in queue');
    break;
  case 'start-failed':
    console.log('Task failed to start:', task.startError);
    break;
}
```

### Error Handling

Error handling remains the same:

```typescript
// v1.x and v2.0 - identical error handling
try {
  const task = manager.start({ cmd: ['invalid-command'], logDir: 'logs' });
  if (task.status === 'start-failed') {
    console.error('Start failed:', task.startError);
  }
} catch (error) {
  console.error('Unexpected error:', error);
}

// Queue-specific errors (v2.0 only)
try {
  await manager.startAsync({ cmd: ['task'], logDir: 'logs' });
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Task was cancelled');
  }
}
```

## 🧪 Testing Migration

### Test Compatibility

```typescript
// Test that v1.x behavior is preserved
describe('v1.x Compatibility', () => {
  test('default behavior unchanged', () => {
    const manager = new ProcessManager();
    const task = manager.start({ cmd: ['echo', 'test'], logDir: 'logs' });
    
    expect(task.status).toBe('running');
    expect(task.pid).toBeGreaterThan(0);
    expect(typeof task.id).toBe('string');
  });
  
  test('performance unchanged', () => {
    const manager = new ProcessManager();
    const start = Date.now();
    
    manager.start({ cmd: ['echo', 'test'], logDir: 'logs' });
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms
  });
});
```

### Test Queue Features

```typescript
// Test new queue functionality
describe('Queue Features', () => {
  test('queuing works', async () => {
    const manager = new ProcessManager({ queue: { concurrency: 1 } });
    
    const task1 = manager.start({ cmd: ['sleep', '1'], logDir: 'logs' });
    const task2 = manager.start({ cmd: ['sleep', '1'], logDir: 'logs' });
    
    expect(task1.status).toBe('running');
    expect(task2.status).toBe('queued');
  });
  
  test('async API works', async () => {
    const manager = new ProcessManager({ queue: { concurrency: 5 } });
    
    const task = await manager.startAsync({ 
      cmd: ['echo', 'test'], 
      logDir: 'logs' 
    });
    
    expect(task.status).toBe('running');
  });
});
```

## 📋 Migration Checklist

### Before Migration
- [ ] Review current ProcessManager usage
- [ ] Identify performance-critical paths
- [ ] Determine if queue features are needed
- [ ] Plan testing strategy

### During Migration
- [ ] Update to v2.0 (no changes needed for basic compatibility)
- [ ] Add feature detection if planning to use queues
- [ ] Test existing functionality thoroughly
- [ ] Gradually enable queue features if desired
- [ ] Update error handling for new status values

### After Migration
- [ ] Monitor performance in production
- [ ] Verify all existing tests pass
- [ ] Consider adopting new queue features
- [ ] Update documentation and examples

## 🆘 Troubleshooting

### Common Issues

**Issue: Tasks are queued unexpectedly**
```typescript
// Check configuration
console.log('Queuing enabled:', manager.isQueuingEnabled());
console.log('Queue options:', manager.getQueueOptions());

// Fix: Use immediate execution
const task = manager.start({ 
  cmd: ['task'], 
  logDir: 'logs',
  queue: { immediate: true }  // Force immediate execution
});
```

**Issue: Performance regression**
```typescript
// Check if queuing is accidentally enabled
const options = manager.getQueueOptions();
if (options.concurrency !== Infinity) {
  console.warn('Queuing is enabled, may affect performance');
}

// Fix: Disable queuing
const manager = new ProcessManager({
  queue: { concurrency: Infinity }  // Explicit disable
});
```

**Issue: Events not firing**
```typescript
// Check if events are enabled
const options = manager.getQueueOptions();
console.log('Events enabled:', options.emitQueueEvents);

// Fix: Enable events
manager.setQueueOptions({ emitQueueEvents: true });
```

### Getting Help

1. **Check compatibility:** Use `manager.supportsQueue` and `manager.isQueuingEnabled()`
2. **Review configuration:** Call `manager.getQueueOptions()`
3. **Test with default settings:** Create `new ProcessManager()` to ensure v1.x behavior
4. **Enable debug logging:** Set queue events to see what's happening

## 🎯 Best Practices

### For Library Authors
```typescript
// Don't assume queue features are available
if (manager.supportsQueue && manager.isQueuingEnabled()) {
  // Use queue features
  await manager.queue.onIdle();
} else {
  // Fall back to polling or other methods
  await pollForCompletion();
}
```

### For Application Developers
```typescript
// Start with compatibility, add features gradually
const manager = new ProcessManager(); // v1.x compatible

// Later, when ready for queuing:
const manager = new ProcessManager({
  queue: { concurrency: 5 }
});
```

### For Testing
```typescript
// Use immediate mode for fast tests
const testManager = new ProcessManager(); // No queuing

// Use queue mode for integration tests
const integrationManager = new ProcessManager({
  queue: { concurrency: 2 }
});
```

---

**Remember:** v2.0 is designed for **zero-friction migration**. Your existing code works unchanged, and you can adopt new features at your own pace.