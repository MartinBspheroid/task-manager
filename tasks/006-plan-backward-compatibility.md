# Task 006: Plan Backward Compatibility

## Objective

Ensure that the introduction of queue functionality does not break existing code, providing a seamless upgrade path for users while enabling new features for those who opt in.

## Background

Backward compatibility is critical because:
- Users have existing code depending on current behavior
- Breaking changes cause upgrade friction
- Trust in the library depends on stability
- Gradual adoption is easier than forced migration

## Current Behavior to Preserve

Based on Task 003 documentation:

1. **Synchronous API Contract**
   ```typescript
   const info = manager.start({ cmd: ['task'] });
   // info.status === 'running' (immediate)
   // info.pid > 0 (process already started)
   ```

2. **Immediate Execution**
   - Process spawns before `start()` returns
   - No artificial delays or queuing
   - Resources allocated immediately

3. **Event Timing**
   - Events fire synchronously where possible
   - No unexpected async delays

4. **Resource Management**
   - Tasks retained in memory after completion
   - No automatic cleanup
   - No limits on concurrent processes

## Compatibility Strategy

### 1. Default Configuration

```typescript
class ProcessManager {
  constructor(opts?: ProcessManagerOptions) {
    // Default: queuing disabled
    this.queueOptions = {
      concurrency: Infinity, // No limit = no queuing
      autoStart: true,
      ...opts?.queue
    };
  }
}
```

### 2. Dual Execution Paths

```typescript
start(opts: ProcessTaskOpts): TaskInfo {
  if (this.isQueuingEffectivelyDisabled()) {
    // FAST PATH: Original behavior
    return this.startImmediate(opts);
  } else {
    // SLOW PATH: Queue-aware behavior
    return this.startQueued(opts);
  }
}

private isQueuingEffectivelyDisabled(): boolean {
  return (
    this.queueOptions.concurrency === Infinity &&
    !this.queueOptions.interval &&
    !this.queueOptions.intervalCap
  );
}
```

### 3. API Additions (Non-Breaking)

```typescript
// New methods that don't affect existing API
class ProcessManager {
  // Existing method unchanged
  start(opts: ProcessTaskOpts): TaskInfo;
  
  // New async variant for queue-aware code
  async startAsync(opts: ProcessTaskOpts): Promise<TaskInfo>;
  
  // New queue management
  setQueueOptions(opts: QueueOptions): void;
  pauseQueue(): void;
  resumeQueue(): void;
}
```

### 4. Status Compatibility

```typescript
// When queuing is disabled, never return 'queued' status
if (this.isQueuingEffectivelyDisabled()) {
  // Status is always 'running' or 'start-failed'
  return { ...info, status: 'running' };
}

// Only when queuing is enabled
return { ...info, status: 'queued' };
```

## Migration Scenarios

### Scenario 1: No Changes Needed

```typescript
// Existing code continues to work
const manager = new ProcessManager();
const info = manager.start({ cmd: ['task'] });
console.log(info.status); // 'running' - immediate execution
```

### Scenario 2: Opt-in to Queuing

```typescript
// Explicit opt-in required
const manager = new ProcessManager({
  queue: { concurrency: 5 }
});

// Option A: Use new async API
const info = await manager.startAsync({ cmd: ['task'] });

// Option B: Handle queued status
const info = manager.start({ cmd: ['task'] });
if (info.status === 'queued') {
  // New status only appears when queuing is enabled
}
```

### Scenario 3: Gradual Migration

```typescript
// Start with compatible wrapper
class QueueAwareManager extends ProcessManager {
  async start(opts: ProcessTaskOpts): Promise<TaskInfo> {
    const info = super.start(opts);
    if (info.status === 'queued') {
      // Wait for task to start
      await this.waitForStatus(info.id, 'running');
    }
    return info;
  }
}
```

## Feature Detection

```typescript
// Allow code to detect queue support
interface ProcessManager {
  /** Check if queue features are available */
  readonly supportsQueue: boolean;
  
  /** Check if queuing is currently enabled */
  isQueuingEnabled(): boolean;
  
  /** Get queue interface if available */
  readonly queue?: IQueue;
}

// Usage
if (manager.supportsQueue && manager.isQueuingEnabled()) {
  // Use queue features
  await manager.queue.onIdle();
}
```

## Compatibility Tests

Create comprehensive tests to ensure backward compatibility:

```typescript
describe('Backward Compatibility', () => {
  describe('Default behavior (no queue config)', () => {
    test('start() returns immediately with running status', () => {
      const manager = new ProcessManager();
      const before = Date.now();
      const info = manager.start({ cmd: ['sleep', '1'] });
      const after = Date.now();
      
      expect(after - before).toBeLessThan(50);
      expect(info.status).toBe('running');
      expect(info.pid).toBeGreaterThan(0);
    });
    
    test('no queued status ever appears', async () => {
      const manager = new ProcessManager();
      const statuses = new Set<TaskStatus>();
      
      // Start many tasks
      for (let i = 0; i < 100; i++) {
        const info = manager.start({ cmd: ['echo', i.toString()] });
        statuses.add(info.status);
      }
      
      expect(statuses.has('queued')).toBe(false);
    });
  });
  
  describe('Explicit queue disable', () => {
    test('concurrency: Infinity behaves like no queue', () => {
      const manager = new ProcessManager({
        queue: { concurrency: Infinity }
      });
      
      // Should behave identically to default
      const info = manager.start({ cmd: ['task'] });
      expect(info.status).toBe('running');
    });
  });
});
```

## Documentation Strategy

1. **Keep existing examples working**
   - Don't change README examples
   - Add new queue examples separately

2. **Clear upgrade guide**
   ```markdown
   ## Upgrading to v2.0
   
   ### No breaking changes for existing code
   - If you don't use queue features, your code works unchanged
   - Default behavior is identical to v1.x
   
   ### Opting into queue features
   - Set `concurrency` to enable queuing
   - Use `startAsync()` for Promise-based API
   - Check `status === 'queued'` for queue-aware code
   ```

3. **Version compatibility matrix**
   | Feature | v1.x | v2.0 (default) | v2.0 (queue enabled) |
   |---------|------|----------------|----------------------|
   | Immediate start | ✓ | ✓ | ✗ |
   | Sync API | ✓ | ✓ | ✓ (with queued status) |
   | Async API | ✗ | ✓ (optional) | ✓ (recommended) |

## Dependencies

- Task 003 (documented current behavior)
- Task 004 (queue API design)
- Task 005 (abstraction interfaces)

## Success Criteria

- All v1.x code runs unchanged on v2.0
- No performance regression when queue is disabled
- Clear migration path documented
- Feature detection available
- Comprehensive compatibility test suite