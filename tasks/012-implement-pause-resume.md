# Task 012: Implement Pause/Resume

## Objective

Add queue pause/resume functionality for graceful queue management during maintenance, resource constraints, or controlled processing.

## Background

Pause/resume enables:
- Maintenance windows without killing running tasks
- Manual queue control during high load
- Graceful shutdown preparation
- Debug and inspection of queue state

## Implementation

### 1. Queue State Management

```typescript
export class ProcessQueue {
  #isPaused = false;
  
  pause(): void {
    if (!this.#isPaused) {
      this.#queue.pause();
      this.#isPaused = true;
      this.emit('paused');
    }
  }
  
  resume(): void {
    if (this.#isPaused) {
      this.#queue.start();
      this.#isPaused = false;
      this.emit('resumed');
    }
  }
  
  get isPaused(): boolean {
    return this.#isPaused;
  }
}
```

### 2. CLI Integration

```typescript
// src/cli/queue-control.ts
export async function handleQueueCommand(args: string[]): Promise<void> {
  const [command] = args;
  
  switch (command) {
    case 'pause':
      manager.pauseQueue();
      console.log('Queue paused');
      break;
      
    case 'resume':
      manager.resumeQueue();
      console.log('Queue resumed');
      break;
  }
}
```

## Testing

```typescript
test('paused queue does not start new tasks', async () => {
  const manager = new ProcessManager({ queue: { concurrency: 1 } });
  
  // Start long task
  manager.start({ cmd: ['sleep', '1'] });
  
  // Pause and add task
  manager.pauseQueue();
  const queued = manager.start({ cmd: ['echo', 'test'] });
  
  expect(queued.status).toBe('queued');
  
  // Should stay queued
  await new Promise(r => setTimeout(r, 100));
  expect(manager.getQueuedTasks()).toHaveLength(1);
  
  // Resume should start task
  manager.resumeQueue();
  await waitForStatus(manager, queued.id, 'running');
});
```

## Dependencies

- Task 007 (configurable queue)

## Success Criteria

- Queue can be paused and resumed reliably
- Running tasks continue during pause
- Queued tasks wait for resume
- CLI commands work correctly