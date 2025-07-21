# Task 002: Test Synchronization Utilities

## Objective

Create proper test utilities for synchronizing with asynchronous operations, eliminating the need for arbitrary delays and reducing test flakiness.

## Background

Current tests use patterns like `await new Promise(r => setTimeout(r, 50))` which are:
- Fragile and environment-dependent
- Either too short (causing failures) or too long (slowing tests)
- Not indicative of what we're actually waiting for
- Making tests harder to understand and maintain

## Implementation Steps

1. **Create Test Utilities Module**
   ```typescript
   // src/tests/utils/test-helpers.ts
   ```

2. **Implement Key Utilities**

   ### waitForStatus
   ```typescript
   export async function waitForStatus(
     manager: ProcessManager, 
     taskId: string, 
     status: TaskStatus,
     timeout = 5000
   ): Promise<void> {
     const start = Date.now();
     while (Date.now() - start < timeout) {
       const task = manager.list().find(t => t.id === taskId);
       if (task?.status === status) return;
       await new Promise(r => setTimeout(r, 10));
     }
     throw new Error(`Timeout waiting for task ${taskId} to reach status ${status}`);
   }
   ```

   ### waitForTaskCount
   ```typescript
   export async function waitForTaskCount(
     manager: ProcessManager,
     predicate: (tasks: TaskInfo[]) => boolean,
     timeout = 5000
   ): Promise<void> {
     const start = Date.now();
     while (Date.now() - start < timeout) {
       if (predicate(manager.list())) return;
       await new Promise(r => setTimeout(r, 10));
     }
     throw new Error('Timeout waiting for task count condition');
   }
   ```

   ### waitForFileContent
   ```typescript
   export async function waitForFileContent(
     filePath: string,
     predicate: (content: string) => boolean,
     timeout = 5000
   ): Promise<void> {
     const start = Date.now();
     while (Date.now() - start < timeout) {
       try {
         const content = await fs.promises.readFile(filePath, 'utf-8');
         if (predicate(content)) return;
       } catch (e) {
         // File might not exist yet
       }
       await new Promise(r => setTimeout(r, 10));
     }
     throw new Error(`Timeout waiting for file content condition: ${filePath}`);
   }
   ```

   ### createTestManager
   ```typescript
   export function createTestManager(opts?: Partial<ProcessManagerOpts>): ProcessManager {
     // Ensure test logs directory
     mkdirSync('test-logs', { recursive: true });
     return new ProcessManager({
       defaultLogDir: 'test-logs',
       ...opts
     });
   }
   ```

3. **Update Existing Tests**

   Example refactoring:
   ```typescript
   // Before:
   await new Promise((r) => setTimeout(r, 50));
   expect(manager.listRunning().length).toBe(3);

   // After:
   await waitForTaskCount(manager, tasks => 
     tasks.filter(t => t.status === 'running').length === 3
   );
   ```

## Additional Utilities

### EventWaiter
```typescript
export class EventWaiter<T = any> {
  private promise: Promise<T>;
  private resolve!: (value: T) => void;

  constructor() {
    this.promise = new Promise(r => this.resolve = r);
  }

  wait(timeout?: number): Promise<T> {
    if (!timeout) return this.promise;
    return Promise.race([
      this.promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]);
  }

  emit(value: T): void {
    this.resolve(value);
  }
}
```

Usage in tests:
```typescript
const waiter = new EventWaiter<TaskInfo>();
manager.on('task-started', waiter.emit.bind(waiter));
const task = manager.start({...});
await waiter.wait(1000);
```

## Testing Requirements

1. Unit tests for each utility function
2. Test timeout behavior
3. Test error conditions
4. Verify no busy-waiting performance issues

## Dependencies

- Task 001 (clean codebase to work with)

## Success Criteria

- All arbitrary delays removed from tests
- Tests are more readable and self-documenting
- Test execution time reduced
- No flaky tests due to timing issues
- Utilities are reusable for future queue tests