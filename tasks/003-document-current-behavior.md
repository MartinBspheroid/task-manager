# Task 003: Document Current Behavior

## Objective

Create comprehensive documentation of the current ProcessManager behavior to establish a baseline for backward compatibility and set clear expectations for the refactoring.

## Background

Before adding queuing functionality, we need to clearly document:
- Current API contracts and guarantees
- Timing behavior and expectations
- Resource usage patterns
- Edge cases and limitations

This documentation will serve as:
- A contract for backward compatibility
- Test specifications
- Reference for design decisions

## Implementation Steps

1. **Create Behavior Documentation**
   
   ### File: `docs/current-behavior.md`
   
   Document:
   - Synchronous task creation
   - Immediate process spawning
   - Status transitions
   - Event emission timing
   - Resource lifecycle

2. **API Contract Documentation**

   ```markdown
   ## ProcessManager.start() Contract
   
   ### Synchronous Guarantees
   - Returns immediately with TaskInfo
   - Process is spawned before method returns
   - PID is available immediately (unless spawn fails)
   - Status is 'running' on return (or 'start-failed')
   
   ### Timing Guarantees
   - Process starts within the same tick
   - First output can occur immediately
   - Idle timer starts immediately
   ```

3. **Create Sequence Diagrams**

   ```mermaid
   sequenceDiagram
     participant Client
     participant ProcessManager
     participant ProcessTask
     participant Subprocess
     
     Client->>ProcessManager: start(opts)
     ProcessManager->>ProcessTask: new ProcessTask(opts)
     ProcessTask->>Subprocess: spawn()
     Subprocess-->>ProcessTask: pid
     ProcessTask-->>ProcessManager: task
     ProcessManager-->>Client: TaskInfo
   ```

4. **Document Edge Cases**

   - Spawn failures
   - Immediate process exit
   - Resource limits
   - File system errors

5. **Performance Characteristics**

   ```markdown
   ## Performance Profile
   
   ### Memory Usage
   - Per task: ~X KB (ProcessTask object + streams)
   - Retained after exit: ~Y KB (TaskInfo only)
   
   ### CPU Usage
   - Spawn overhead: ~Z ms
   - Stream processing: negligible
   
   ### Limits
   - No artificial limits on concurrent processes
   - OS limits apply (ulimit, file descriptors)
   ```

## Code Analysis Tasks

1. **Trace Execution Path**
   - Add temporary logging
   - Measure timing at each step
   - Document actual behavior

2. **Resource Analysis**
   - Measure memory per task
   - Check file descriptor usage
   - Monitor CPU during spawn

3. **Error Scenarios**
   - Test with invalid commands
   - Test with resource exhaustion
   - Test with permission errors

## Testing Documentation

Create test specs that verify documented behavior:

```typescript
describe('ProcessManager Behavior Contract', () => {
  test('start() returns synchronously with running process', () => {
    const before = Date.now();
    const info = manager.start({ cmd: ['sleep', '1'] });
    const after = Date.now();
    
    expect(after - before).toBeLessThan(50); // Synchronous
    expect(info.status).toBe('running');
    expect(info.pid).toBeGreaterThan(0);
  });
});
```

## Dependencies

- Task 001 (stable codebase)
- Task 002 (test utilities for verification)

## Deliverables

1. `docs/current-behavior.md` - Comprehensive behavior documentation
2. `docs/api-contract.md` - Formal API guarantees
3. `tests/behavior-contract.test.ts` - Tests that verify documented behavior
4. Performance baseline metrics

## Success Criteria

- Documentation accurately reflects implementation
- All edge cases are identified and documented
- Performance characteristics are measured
- Tests verify all documented behaviors
- Clear backward compatibility requirements established