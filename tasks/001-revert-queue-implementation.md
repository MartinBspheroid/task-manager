# Task 001: Revert Queue Implementation

## Objective

Revert the flawed queue implementation from commit `babdeea` while preserving any valuable test improvements or insights gained.

## Background

The current implementation has several critical flaws:
- Uses `concurrency: Infinity` which negates any benefits of queuing
- Introduces race conditions due to async queuing with sync API
- Adds unnecessary complexity and performance overhead
- Breaks API expectations (tasks are queued instead of immediately running)

## Implementation Steps

1. **Git Revert**
   ```bash
   git revert babdeea --no-commit
   ```

2. **Selective Preservation**
   - Keep the `p-queue` dependency in package.json (we'll use it properly later)
   - Preserve any test improvements that revealed timing issues
   - Document lessons learned in comments

3. **Manual Cleanup**
   - Remove ProcessQueue.ts entirely
   - Remove queue-related code from ProcessManager
   - Restore ProcessTask to its original immediate-execution behavior
   - Remove the `queued` status from TaskStatus type

4. **Test Restoration**
   - Remove artificial delays added to work around queue timing
   - Ensure all tests pass without timing hacks

## Code Changes

### ProcessManager.ts
```typescript
// Remove:
// #queue = new ProcessQueue();
// this.#queue.add(task);

// Restore immediate execution in constructor
```

### ProcessTask.ts
```typescript
// Remove run() method
// Restore immediate process spawning in constructor
// Remove queued status handling
```

### types.ts
```typescript
// Change back:
export type TaskStatus = 'running' | 'exited' | 'killed' | 'timeout' | 'start-failed';
// Remove 'queued'
```

## Testing Requirements

1. Run full test suite to ensure no regressions
2. Verify tasks start immediately when created
3. Check that no timing-related test failures occur
4. Validate that ProcessManager.start() returns accurate status

## Dependencies

None - this is the first task

## Success Criteria

- Git history shows clean revert
- All tests pass without artificial delays
- Code is back to stable state
- No references to queue remain in active code