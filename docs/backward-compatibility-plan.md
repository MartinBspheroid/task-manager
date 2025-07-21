# Backward Compatibility Plan

## Overview

This document establishes the comprehensive backward compatibility strategy for introducing queue functionality to the ProcessManager. The plan ensures zero breaking changes for existing users while enabling powerful new features for those who opt in.

## Core Compatibility Principles

### 1. Default Behavior Preservation
- **Zero configuration changes required** for existing code
- **Identical performance characteristics** when queuing is disabled
- **Same API contracts** from Task 003 documentation maintained
- **No new dependencies** for basic functionality

### 2. Opt-in Philosophy
- Queue features are **disabled by default**
- Users must **explicitly enable** queuing to access new features
- **No silent behavior changes** - all changes require explicit configuration

### 3. Graceful Degradation
- Code written for queued mode **works in immediate mode**
- Feature detection allows **conditional use** of queue features
- **Progressive enhancement** model supported

## Current Behavior to Preserve

Based on the API contract documentation from Task 003:

### Synchronous Execution Contract
```typescript
// This behavior MUST be preserved
const manager = new ProcessManager();
const info = manager.start({ cmd: ['task'] });

// Guarantees that MUST remain unchanged:
expect(info.status).toBe('running');        // Immediate execution
expect(info.pid).toBeGreaterThan(0);        // Process spawned
expect(info.startedAt).toBeGreaterThan(0);  // Timestamp set
expect(Date.now() - info.startedAt).toBeLessThan(100); // Immediate return
```

### Performance Characteristics
- `start()` method completes within 100ms (95th percentile)
- No artificial delays or queuing overhead
- Unlimited concurrent processes (no concurrency limits)
- Immediate resource allocation

### API Surface
- All existing methods work unchanged
- Same error conditions and error messages
- Identical event timing and emission patterns
- Same hook execution behavior

## Compatibility Implementation Strategy

### 1. Dual Execution Architecture

```typescript
class ProcessManager {
  private queueConfig: QueueConfig = {
    concurrency: Infinity,  // Default: no limits = no queuing
    autoStart: true,
    emitEvents: false
  };

  start(opts: ProcessTaskOpts): TaskInfo {
    if (this.isQueuingDisabled()) {
      // FAST PATH: Original v1.x behavior
      return this.executeImmediate(opts);
    } else {
      // QUEUE PATH: New queued behavior
      return this.executeQueued(opts);
    }
  }

  private isQueuingDisabled(): boolean {
    return (
      this.queueConfig.concurrency === Infinity &&
      !this.queueConfig.interval &&
      !this.queueConfig.intervalCap
    );
  }
}
```

### 2. Configuration-Based Activation

```typescript
// Default: Original behavior (queuing disabled)
const manager = new ProcessManager();

// Explicit opt-in required for queuing
const queuedManager = new ProcessManager({
  queue: { 
    concurrency: 5  // This enables queuing
  }
});
```

### 3. Status Compatibility

```typescript
// Status values based on configuration
if (this.isQueuingDisabled()) {
  // Original status values only: 'running' | 'exited' | 'killed' | 'timeout' | 'start-failed'
  return { ...taskInfo, status: 'running' };
} else {
  // Extended status values: includes 'queued'
  return { ...taskInfo, status: 'queued' };
}
```

## API Extensions (Non-Breaking)

### New Methods (Optional)
```typescript
class ProcessManager {
  // Existing methods - unchanged
  start(opts: ProcessTaskOpts): TaskInfo;
  list(): TaskInfo[];
  kill(id: string): void;
  
  // New methods - additive only
  startAsync(opts: ProcessTaskOpts): Promise<TaskInfo>;
  setQueueOptions(options: QueueOptions): void;
  getQueueOptions(): QueueOptions;
  
  // Feature detection
  readonly supportsQueue: boolean;
  isQueuingEnabled(): boolean;
  readonly queue?: IQueue;
}
```

### New Configuration (Optional)
```typescript
interface ProcessManagerOptions {
  // New optional queue configuration
  queue?: {
    concurrency?: number;     // Infinity = disabled (default)
    interval?: number;
    intervalCap?: number;
    autoStart?: boolean;      // true (default)
    emitEvents?: boolean;     // false (default)
  };
}
```

## Migration Scenarios

### Scenario 1: No Changes (95% of users)
```typescript
// Existing code - zero changes required
const manager = new ProcessManager();

// All existing APIs work identically
const task = manager.start({ cmd: ['build'] });
console.log(task.status); // 'running' - immediate execution

// Performance is identical to v1.x
const tasks = [];
for (let i = 0; i < 1000; i++) {
  tasks.push(manager.start({ cmd: ['task', i.toString()] }));
}
// All 1000 tasks start immediately
```

### Scenario 2: Opt-in to Basic Queuing
```typescript
// Explicit configuration change required
const manager = new ProcessManager({
  queue: { concurrency: 3 }  // This enables queuing
});

// Option A: Use existing sync API with new status
const task = manager.start({ cmd: ['build'] });
if (task.status === 'queued') {
  console.log('Task is queued for execution');
}

// Option B: Use new async API (recommended)
const task = await manager.startAsync({ cmd: ['build'] });
console.log(task.status); // 'running' (waits for execution start)
```

### Scenario 3: Feature Detection
```typescript
// Code that adapts to queue availability
function startTask(manager: ProcessManager, cmd: string[]) {
  if (manager.supportsQueue && manager.isQueuingEnabled()) {
    // Use queue-aware API
    return manager.startAsync({ cmd });
  } else {
    // Use traditional immediate API
    return Promise.resolve(manager.start({ cmd }));
  }
}
```

### Scenario 4: Gradual Migration
```typescript
// Custom wrapper for gradual migration
class CompatibleManager extends ProcessManager {
  async start(opts: ProcessTaskOpts): Promise<TaskInfo> {
    const info = super.start(opts);
    
    if (info.status === 'queued') {
      // Wait for actual execution to start
      await this.waitForExecution(info.id);
      return this.getTaskInfo(info.id);
    }
    
    return info;
  }
}
```

## Testing Strategy

### Compatibility Test Suite
```typescript
// Test file: src/tests/backward-compatibility.test.ts

describe('Backward Compatibility', () => {
  describe('Default Configuration (v1.x behavior)', () => {
    test('immediate execution timing', () => {
      const manager = new ProcessManager();
      const start = process.hrtime.bigint();
      const info = manager.start({ cmd: ['echo', 'test'], logDir: 'logs' });
      const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
      
      expect(duration).toBeLessThan(50);  // < 50ms
      expect(info.status).toBe('running');
      expect(info.pid).toBeGreaterThan(0);
    });
    
    test('no queued status appears', () => {
      const manager = new ProcessManager();
      const statuses = new Set();
      
      for (let i = 0; i < 100; i++) {
        const info = manager.start({ cmd: ['echo', i.toString()], logDir: 'logs' });
        statuses.add(info.status);
      }
      
      expect(statuses.has('queued')).toBe(false);
      expect(statuses.has('running') || statuses.has('start-failed')).toBe(true);
    });
    
    test('unlimited concurrency preserved', () => {
      const manager = new ProcessManager();
      const tasks = [];
      
      // Start many tasks simultaneously
      for (let i = 0; i < 50; i++) {
        tasks.push(manager.start({ cmd: ['sleep', '0.1'], logDir: 'logs' }));
      }
      
      // All should start immediately
      tasks.forEach(task => {
        expect(task.status).toBe('running');
        expect(task.pid).toBeGreaterThan(0);
      });
    });
  });
  
  describe('Explicit Infinity Configuration', () => {
    test('behaves identical to default', () => {
      const defaultManager = new ProcessManager();
      const explicitManager = new ProcessManager({
        queue: { concurrency: Infinity }
      });
      
      const defaultTask = defaultManager.start({ cmd: ['echo', 'test'], logDir: 'logs' });
      const explicitTask = explicitManager.start({ cmd: ['echo', 'test'], logDir: 'logs' });
      
      expect(defaultTask.status).toBe(explicitTask.status);
      expect(defaultTask.status).toBe('running');
    });
  });
  
  describe('Feature Detection', () => {
    test('supportsQueue is always true', () => {
      const manager = new ProcessManager();
      expect(manager.supportsQueue).toBe(true);
    });
    
    test('isQueuingEnabled reflects configuration', () => {
      const defaultManager = new ProcessManager();
      const queuedManager = new ProcessManager({ queue: { concurrency: 3 } });
      
      expect(defaultManager.isQueuingEnabled()).toBe(false);
      expect(queuedManager.isQueuingEnabled()).toBe(true);
    });
    
    test('queue interface availability', () => {
      const defaultManager = new ProcessManager();
      const queuedManager = new ProcessManager({ queue: { concurrency: 3 } });
      
      expect(defaultManager.queue).toBeInstanceOf(NullQueue);
      expect(queuedManager.queue).toBeInstanceOf(PQueueAdapter);
    });
  });
});
```

### Performance Regression Tests
```typescript
describe('Performance Compatibility', () => {
  test('no performance regression in default mode', () => {
    const manager = new ProcessManager();
    const iterations = 1000;
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      manager.start({ cmd: ['echo', i.toString()], logDir: 'logs' });
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1_000_000);
    }
    
    const p95 = times.sort((a, b) => a - b)[Math.floor(iterations * 0.95)]!;
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    
    expect(p95).toBeLessThan(100);  // 95th percentile < 100ms
    expect(mean).toBeLessThan(50);  // Mean < 50ms
  });
  
  test('memory usage remains constant', () => {
    const manager = new ProcessManager();
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Create many tasks
    for (let i = 0; i < 1000; i++) {
      manager.start({ cmd: ['echo', i.toString()], logDir: 'logs' });
    }
    
    if (global.gc) global.gc();
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Memory should not grow significantly
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // < 10MB
  });
});
```

## Documentation Updates

### README Compatibility Section
```markdown
## Backward Compatibility

### v2.0 is fully backward compatible with v1.x

If you don't use queue features, your existing code works unchanged:

```typescript
// v1.x code works identically in v2.0
const manager = new ProcessManager();
const task = manager.start({ cmd: ['build'] });
console.log(task.status); // 'running'
```

### Opting into Queue Features

Queue features are disabled by default. To enable:

```typescript
// Explicit opt-in required
const manager = new ProcessManager({
  queue: { concurrency: 3 }  // Enables queuing
});
```

### Migration Guide

1. **No changes needed** - existing code works
2. **Optional: Enable queuing** - set concurrency limit
3. **Optional: Use async API** - better queue integration
4. **Optional: Handle queued status** - for queue-aware code
```

### Version Compatibility Matrix

| Feature | v1.x | v2.0 (default) | v2.0 (queued) |
|---------|------|----------------|---------------|
| **Execution Model** |
| Immediate start | ✅ | ✅ | ❌ |
| Unlimited concurrency | ✅ | ✅ | ❌ |
| **API Compatibility** |
| Sync API (`start()`) | ✅ | ✅ | ✅* |
| Same return values | ✅ | ✅ | ✅* |
| Same error handling | ✅ | ✅ | ✅ |
| **Performance** |
| < 100ms start time | ✅ | ✅ | ❌ |
| No memory overhead | ✅ | ✅ | ❌ |
| **New Features** |
| Async API | ❌ | ✅ | ✅ |
| Concurrency limits | ❌ | ❌ | ✅ |
| Priority queuing | ❌ | ❌ | ✅ |
| Rate limiting | ❌ | ❌ | ✅ |

*\* With new 'queued' status when queue is enabled*

## Implementation Checklist

### Phase 1: Foundation
- [ ] Implement dual execution paths
- [ ] Add queue configuration detection
- [ ] Create compatibility test suite
- [ ] Document migration strategies

### Phase 2: API Extensions
- [ ] Add `startAsync()` method
- [ ] Implement feature detection properties
- [ ] Add queue management methods
- [ ] Extend configuration options

### Phase 3: Testing & Documentation
- [ ] Complete backward compatibility tests
- [ ] Performance regression testing
- [ ] Update documentation
- [ ] Create migration examples

## Success Metrics

### Compatibility
- [ ] 100% of v1.x tests pass unchanged
- [ ] No performance regression in default mode
- [ ] No new dependencies for basic usage

### Usability
- [ ] Clear feature detection API
- [ ] Intuitive migration path
- [ ] Comprehensive documentation
- [ ] Working examples for all scenarios

### Quality
- [ ] Complete test coverage
- [ ] Performance benchmarks
- [ ] Memory usage validation
- [ ] Stress testing under load