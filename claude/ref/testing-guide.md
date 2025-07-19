# Testing Guide

## Test Setup

### Framework

Uses Bun's built-in test framework:

```typescript
import { expect, test } from 'bun:test';
```

**Benefits:**
- No additional dependencies
- Fast execution
- Native TypeScript support
- Built-in assertions

### Test Environment Setup

Each test ensures proper environment:

```typescript
// Ensure logs directory exists
mkdirSync('logs', { recursive: true });
```

**Requirements:**
- Log directory must exist before ProcessManager operations
- Tests should clean up or use unique directories
- File system permissions must allow log file creation

## Current Test Coverage

### Core Functionality Tests

#### Integration Test: Idle Timeout
**File:** `src/tests/process.test.ts`

**Test Scenario:**
1. Start process with reduced timeout (2s vs default 5min)
2. Use command that outputs then sleeps: `bash -c 'echo hi && sleep 600'`
3. Wait longer than timeout (3s)
4. Verify process was killed with 'timeout' status
5. Verify log file contains expected output

**Key Assertions:**
```typescript
expect(list[0]?.status).toBe('timeout');
expect(log).toContain('hi');
```

#### Running Tasks Filter
**File:** `src/tests/listRunning.test.ts`

**Test Scenarios:**
1. **Multiple Tasks Filter**: Start running and quick-exit tasks, verify only running tasks returned
2. **Empty State**: Verify empty array when no tasks running

**Key Assertions:**
```typescript
expect(runningTasks.length).toBe(1);
expect(runningTasks[0]?.status).toBe('running');
```

#### Kill All Functionality
**File:** `src/tests/killAll.test.ts`

**Test Scenarios:**
1. **Multiple Running Tasks**: Kill all running processes, verify IDs returned
2. **Empty State**: Verify empty array when no running tasks
3. **Mixed States**: Only kill running tasks, leave exited ones untouched

**Key Assertions:**
```typescript
expect(killedIds.length).toBe(3);
expect(runningAfter.length).toBe(0);
```

#### Tag Support
**File:** `src/tests/tags.test.ts`

**Test Scenarios:**
1. **Multiple Tags**: Create tasks with multiple tags, verify preservation
2. **No Tags**: Verify tasks can be created without tags
3. **Single Tag**: Test single tag assignment
4. **Tag Persistence**: Verify tags preserved after process exit

**Key Assertions:**
```typescript
expect(task.tags).toEqual(['web-server', 'production']);
expect(task.tags).toBeUndefined();
```

#### Tag-Based Killing
**File:** `src/tests/killByTag.test.ts`

**Test Scenarios:**
1. **Selective Killing**: Kill only processes with matching tag
2. **Non-existent Tag**: Return empty array for non-existent tags
3. **Partial Matches**: Kill processes with overlapping tags
4. **Running Only**: Only affect running processes, not exited ones

**Key Assertions:**
```typescript
expect(killedIds).toContain(webTask1.id);
expect(killedIds).not.toContain(dbTask.id);
```

### Test Timing

**Reduced Timeouts:**
- Production default: 5 minutes
- Test timeout: 2 seconds
- Test wait: 3 seconds

**Benefits:**
- Fast test execution
- Predictable timing
- CI/CD friendly

## Testing Patterns

### Async Testing

Uses Promise-based delays:

```typescript
await new Promise((r) => setTimeout(r, 3000));
```

**Considerations:**
- Tests are time-dependent
- Could be flaky on slow systems
- Balance between speed and reliability

### File System Verification

Validates logging functionality:

```typescript
const log = readFileSync(info.logFile, 'utf8');
expect(log).toContain('hi');
```

**Checks:**
- Log file creation
- Content accuracy
- File accessibility

## Testing Strategies

### Unit Testing Approach

**Current State:** Integration tests only

**Potential Unit Tests:**
- ProcessTask timeout logic
- Stream pipe functionality
- Status state transitions
- Error handling paths

### Mock Strategies

**For Better Unit Testing:**

```typescript
// Mock Bun's spawn
const mockSpawn = {
  pid: 1234,
  stdout: mockReadableStream,
  stderr: mockReadableStream,
  stdin: mockWritableStream,
  exited: Promise.resolve(0),
  kill: jest.fn()
};
```

### Test Data Management

**Log Files:**
- Tests create real log files
- No cleanup in current implementation
- Consider temporary directories for isolation

**Process Commands:**
- Use simple, predictable commands
- Avoid system-dependent behavior
- Consider cross-platform compatibility

## Recommended Test Expansions

### Additional Test Cases

1. **Natural Process Exit**
   ```typescript
   cmd: ['echo', 'hello']  // Exits immediately
   ```

2. **Manual Termination**
   ```typescript
   manager.kill(info.id, 'SIGTERM');
   ```

3. **Stdin Communication**
   ```typescript
   manager.write(info.id, 'input\n');
   ```

4. **Error Scenarios**
   ```typescript
   expect(() => manager.kill('invalid-id')).toThrow();
   ```

5. **Multiple Tasks**
   ```typescript
   const task1 = manager.start({...});
   const task2 = manager.start({...});
   expect(manager.list()).toHaveLength(2);
   ```

### Performance Testing

**Timing Tests:**
- Verify idle timeout accuracy
- Measure startup overhead
- Test concurrent task limits

**Resource Tests:**
- Memory usage with many tasks
- File descriptor limits
- Log file size management

### Error Handling Tests

**File System Errors:**
- Invalid log directory
- Permission denied scenarios
- Disk full conditions

**Process Errors:**
- Invalid commands
- Command not found
- Permission denied execution

## Test Organization

### Current Structure

```
src/tests/
├── process.test.ts          # Core idle timeout integration test
├── listRunning.test.ts      # Running tasks filtering tests
├── killAll.test.ts          # Kill all functionality tests
├── tags.test.ts             # Tag support and persistence tests
└── killByTag.test.ts        # Tag-based killing tests
```

### Recommended Future Structure

```
src/tests/
├── unit/
│   ├── ProcessManager.test.ts
│   ├── ProcessTask.test.ts
│   └── types.test.ts
├── integration/
│   ├── process-lifecycle.test.ts
│   ├── timeout-behavior.test.ts
│   ├── multi-task.test.ts
│   └── tag-management.test.ts
└── fixtures/
    ├── test-commands.ts
    └── mock-data.ts
```

### Test Utilities

**Helper Functions:**
```typescript
function createTestManager() { ... }
function waitForStatus(manager, id, status, timeout) { ... }
function cleanupLogs() { ... }
```

## CI/CD Considerations

### Environment Requirements

- Bun runtime available
- File system write permissions
- Bash available for test commands
- Reasonable timing precision

### Flaky Test Prevention

- Use deterministic timeouts
- Add retry logic for timing-sensitive tests
- Mock time-dependent operations
- Use relative timing where possible