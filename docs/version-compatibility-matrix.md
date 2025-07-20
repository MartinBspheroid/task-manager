# Version Compatibility Matrix

## Overview

This document provides a comprehensive comparison of ProcessManager functionality across versions, helping users understand what changes with different configurations and versions.

## Version Comparison

| Feature Category | v1.x | v2.0 (Default) | v2.0 (Queue Enabled) |
|------------------|------|----------------|----------------------|
| **Core Execution** |
| Immediate task start | ✅ Yes | ✅ Yes | ❌ No* |
| Synchronous API | ✅ Yes | ✅ Yes | ✅ Yes** |
| Unlimited concurrency | ✅ Yes | ✅ Yes | ❌ No |
| Return timing | < 100ms | < 100ms | < 100ms*** |
| **Task Management** |
| list() method | ✅ Yes | ✅ Yes | ✅ Yes |
| listRunning() method | ✅ Yes | ✅ Yes | ✅ Yes |
| kill() method | ✅ Yes | ✅ Yes | ✅ Yes |
| killAll() method | ✅ Yes | ✅ Yes | ✅ Yes |
| killByTag() method | ✅ Yes | ✅ Yes | ✅ Yes |
| **Status Values** |
| 'running' status | ✅ Yes | ✅ Yes | ✅ Yes |
| 'exited' status | ✅ Yes | ✅ Yes | ✅ Yes |
| 'killed' status | ✅ Yes | ✅ Yes | ✅ Yes |
| 'timeout' status | ✅ Yes | ✅ Yes | ✅ Yes |
| 'start-failed' status | ✅ Yes | ✅ Yes | ✅ Yes |
| 'queued' status | ❌ No | ❌ No | ✅ Yes |
| **Performance** |
| Start latency P95 | < 100ms | < 100ms | Varies**** |
| Memory overhead | Minimal | Minimal | Moderate |
| CPU overhead | Minimal | Minimal | Low |
| **New Features** |
| Async API (startAsync) | ❌ No | ✅ Yes | ✅ Yes |
| Queue configuration | ❌ No | ✅ Yes | ✅ Yes |
| Concurrency limits | ❌ No | ❌ No | ✅ Yes |
| Priority queuing | ❌ No | ❌ No | ✅ Yes |
| Rate limiting | ❌ No | ❌ No | ✅ Yes |
| Queue events | ❌ No | ❌ No | ✅ Yes |
| Queue management | ❌ No | ❌ No | ✅ Yes |
| Feature detection | ❌ No | ✅ Yes | ✅ Yes |

*\* Tasks may be queued first*  
*\*\* Sync API returns immediately but task may be queued*  
*\*\*\* Method returns quickly, but task execution may be delayed*  
*\*\*\*\* Depends on queue size and concurrency settings*

## Configuration Impact

### Default Configuration (Backward Compatible)

```typescript
// This configuration preserves v1.x behavior
const manager = new ProcessManager();
// or explicitly:
const manager = new ProcessManager({
  queue: { concurrency: Infinity }
});
```

| Aspect | Behavior |
|--------|----------|
| Task execution | Immediate |
| Status returned | 'running' or 'start-failed' |
| Concurrency | Unlimited |
| Performance | Identical to v1.x |
| Memory usage | Identical to v1.x |

### Basic Queue Configuration

```typescript
const manager = new ProcessManager({
  queue: { concurrency: 5 }
});
```

| Aspect | Behavior |
|--------|----------|
| Task execution | Queued when > 5 tasks running |
| Status returned | 'running' or 'queued' |
| Concurrency | Limited to 5 |
| Performance | Slight queue overhead |
| Memory usage | Queue storage overhead |

### Advanced Queue Configuration

```typescript
const manager = new ProcessManager({
  queue: { 
    concurrency: 3,
    interval: 60000,
    intervalCap: 10,
    emitQueueEvents: true
  }
});
```

| Aspect | Behavior |
|--------|----------|
| Task execution | Queued with concurrency + rate limits |
| Status returned | 'running' or 'queued' |
| Concurrency | Limited to 3 simultaneous |
| Rate limiting | Max 10 tasks per minute |
| Events | Queue events emitted |
| Performance | Queue + rate limiting overhead |

## API Compatibility Details

### Constructor Compatibility

| Pattern | v1.x | v2.0 Default | v2.0 Queued |
|---------|------|--------------|-------------|
| `new ProcessManager()` | ✅ | ✅ | ✅ |
| `new ProcessManager({})` | ❌ | ✅ | ✅ |
| `new ProcessManager({ queue: ... })` | ❌ | ✅ | ✅ |

### Method Compatibility

#### start() Method

| Configuration | Return Status | Execution | Compatible |
|---------------|---------------|-----------|------------|
| Default | 'running' \| 'start-failed' | Immediate | ✅ Full |
| Queue disabled | 'running' \| 'start-failed' | Immediate | ✅ Full |
| Queue enabled | 'running' \| 'queued' \| 'start-failed' | May be delayed | ⚠️ Partial |

#### New Methods (v2.0 only)

| Method | Default Mode | Queue Mode | Purpose |
|--------|--------------|------------|---------|
| `startAsync()` | ✅ Available | ✅ Available | Promise-based task starting |
| `setQueueOptions()` | ✅ Available | ✅ Available | Runtime queue configuration |
| `getQueueOptions()` | ✅ Available | ✅ Available | Current configuration |
| `isQueuingEnabled()` | ✅ Available | ✅ Available | Feature detection |
| `pauseQueue()` | 🔄 No-op | ✅ Functional | Queue management |
| `resumeQueue()` | 🔄 No-op | ✅ Functional | Queue management |

### Property Compatibility

| Property | v1.x | v2.0 Default | v2.0 Queued | Description |
|----------|------|--------------|-------------|-------------|
| `supportsQueue` | ❌ | ✅ true | ✅ true | Feature detection |
| `queue` | ❌ | ✅ NullQueue | ✅ PQueueAdapter | Queue interface |

## Breaking Changes

### ❌ None for Default Configuration

When using default configuration, there are **zero breaking changes** from v1.x to v2.0.

### ⚠️ Behavioral Changes with Queue Enabled

These changes only occur when explicitly enabling queue features:

1. **New Status Value**
   ```typescript
   // v1.x: never happens
   // v2.0 with queuing: possible
   const task = manager.start({ cmd: ['task'], logDir: 'logs' });
   if (task.status === 'queued') {
     // Handle queued state
   }
   ```

2. **Execution Timing**
   ```typescript
   // v1.x: always immediate
   // v2.0 with queuing: may be delayed
   const task = manager.start({ cmd: ['task'], logDir: 'logs' });
   console.log(task.pid); // May be -1 if queued
   ```

3. **Concurrency Limits**
   ```typescript
   // v1.x: unlimited
   // v2.0 with queuing: limited by configuration
   for (let i = 0; i < 100; i++) {
     manager.start({ cmd: ['task'], logDir: 'logs' });
     // Only N will run simultaneously
   }
   ```

## Migration Compatibility

### Safe Migrations (No Code Changes)

| From | To | Compatible | Notes |
|------|----|-----------| ------|
| v1.x | v2.0 default | ✅ Full | Drop-in replacement |
| v2.0 default | v2.0 + queue | ⚠️ Behavioral | Code may need updates |

### Code Changes Required

| Scenario | Required Changes | Example |
|----------|------------------|---------|
| Enable queuing | Handle 'queued' status | `if (task.status === 'queued') {...}` |
| Use async API | Switch to Promise-based | `await manager.startAsync(opts)` |
| Use queue events | Add event listeners | `manager.on('queue:idle', ...)` |

## Testing Compatibility

### Test Suite Compatibility

| Test Type | v1.x Tests | v2.0 Default | v2.0 Queued |
|-----------|------------|--------------|-------------|
| Unit tests | ✅ Pass | ✅ Pass | ⚠️ May need updates |
| Integration tests | ✅ Pass | ✅ Pass | ⚠️ May need updates |
| Performance tests | ✅ Pass | ✅ Pass | ❌ Different behavior |

### Test Updates for Queue Mode

```typescript
// v1.x test - needs update for queue mode
test('task starts immediately', () => {
  const task = manager.start({ cmd: ['test'], logDir: 'logs' });
  expect(task.status).toBe('running'); // May be 'queued' in queue mode
});

// v2.0 compatible test
test('task starts or queues', () => {
  const task = manager.start({ cmd: ['test'], logDir: 'logs' });
  expect(['running', 'queued', 'start-failed']).toContain(task.status);
});
```

## Performance Compatibility

### Timing Expectations

| Operation | v1.x | v2.0 Default | v2.0 Queued |
|-----------|------|--------------|-------------|
| `start()` method | < 100ms | < 100ms | < 100ms* |
| Task execution start | Immediate | Immediate | Delayed** |
| Memory per task | ~1KB | ~1KB | ~1-2KB*** |

*\* Method returns quickly, task may queue*  
*\*\* Depends on queue position*  
*\*\*\* Includes queue metadata*

### Resource Usage

| Resource | v1.x | v2.0 Default | v2.0 Queued |
|----------|------|--------------|-------------|
| Memory baseline | Low | Low | Low |
| Memory growth | Linear with tasks | Linear with tasks | Linear + queue size |
| CPU overhead | Minimal | Minimal | Low |
| Event loop pressure | High with many tasks | High with many tasks | Controlled |

## Error Compatibility

### Error Types

| Error Scenario | v1.x | v2.0 Default | v2.0 Queued |
|----------------|------|--------------|-------------|
| Invalid command | 'start-failed' status | 'start-failed' status | 'start-failed' status |
| Task not found | Throws error | Throws error | Throws error |
| Resource exhaustion | System limits | System limits | Queue limits |

### Error Messages

All error messages remain identical across versions to maintain compatibility.

## Ecosystem Compatibility

### Library Compatibility

| Integration | v1.x | v2.0 Default | v2.0 Queued |
|-------------|------|--------------|-------------|
| Logging libraries | ✅ Compatible | ✅ Compatible | ✅ Compatible |
| Monitoring tools | ✅ Compatible | ✅ Compatible | ⚠️ May need updates |
| Testing frameworks | ✅ Compatible | ✅ Compatible | ⚠️ May need updates |

### Framework Integration

| Framework | Compatibility | Notes |
|-----------|---------------|-------|
| Express.js | ✅ Full | No changes needed |
| Fastify | ✅ Full | No changes needed |
| NestJS | ✅ Full | Can leverage DI for queue config |
| Next.js | ✅ Full | No changes needed |

## Future Compatibility

### Version Strategy

| Version | Compatibility Promise |
|---------|----------------------|
| v2.x | Full backward compatibility with v1.x |
| v3.x | Deprecation warnings for removed features |
| v4.x | May remove deprecated features |

### Feature Evolution

| Feature | v2.0 | v2.1+ | v3.0 |
|---------|------|-------|------|
| Default behavior | v1.x compatible | v1.x compatible | v1.x compatible |
| Queue features | Basic | Enhanced | Advanced |
| Performance | Good | Better | Optimized |

---

**Key Takeaway:** v2.0 is designed for seamless compatibility. Your v1.x code will work unchanged, and you can adopt new features gradually.