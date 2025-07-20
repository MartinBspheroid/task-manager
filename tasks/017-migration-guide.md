# Task 017: Create Migration Guide

## Objective

Provide clear guidance for users upgrading to the new queue-enabled version, ensuring smooth adoption and addressing common concerns.

## Migration Guide Content

### 1. Compatibility Matrix

| Feature | v1.x | v2.0 (default) | v2.0 (queue enabled) |
|---------|------|----------------|----------------------|
| Immediate start | ✓ | ✓ | ✗ (queued) |
| Sync API | ✓ | ✓ | ✓ (with status) |
| Status values | 4 types | 4 types | 5 types (+queued) |

### 2. Common Migration Patterns

```typescript
// Pattern 1: No changes needed
const manager = new ProcessManager();
const info = manager.start({ cmd: ['task'] }); // Works as before

// Pattern 2: Opt into queuing
const manager = new ProcessManager({
  queue: { concurrency: 5 }
});

// Pattern 3: Handle new status
const info = manager.start({ cmd: ['task'] });
if (info.status === 'queued') {
  console.log('Task is queued');
} else {
  console.log('Task is running');
}
```

### 3. Troubleshooting Common Issues

- Why tasks now show 'queued' status
- Performance concerns with queue overhead
- How to disable queuing completely
- Debugging queue issues

## Dependencies

- Task 016 (documentation updates)

## Success Criteria

- Clear upgrade instructions
- Common issues addressed
- Code examples work
- No confusion about changes