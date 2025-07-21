# Task Manager

A TypeScript task manager that spawns and manages child processes with logging, timeout capabilities, and optional queue management. Built for reliability and scalability with Bun runtime.

## 📚 Documentation

- **[API Reference](./claude/ref/api-reference.md)** - Complete API documentation with examples
- **[Architecture Guide](./claude/ref/architecture.md)** - System design and data flow
- **[Migration Guide](./docs/migration-guide.md)** - Upgrade from v1.x to v2.0  
- **[Queue Usage Guide](./docs/queue-usage.md)** - Best practices and patterns
- **[Compatibility Matrix](./docs/version-compatibility-matrix.md)** - Feature comparison across versions

## 🚀 Quick Start

### Basic Usage (v1.x Compatible)

```typescript
import { ProcessManager } from './src/core/ProcessManager';

const manager = new ProcessManager();

// Start a process - runs immediately
const task = manager.start({
  cmd: ['node', 'script.js'],
  logDir: './logs'
});

console.log(`Started task ${task.id} with PID ${task.pid}`);
```

### With Queue Management (v2.0)

```typescript
import { ProcessManager } from './src/core/ProcessManager';

// Enable queue with concurrency limit
const manager = new ProcessManager({
  queue: { concurrency: 4 }
});

// Tasks beyond limit will be queued automatically
const task = manager.start({
  cmd: ['heavy-process', 'data.json'],
  logDir: './logs',
  queue: { priority: 100 } // Higher priority
});

if (task.status === 'queued') {
  console.log('Task queued for execution');
} else {
  console.log('Task started immediately');
}
```

**[More details in API Reference →](./claude/ref/api-reference.md)**

## ✨ Key Features

### Process Management
- **Automatic Logging**: stdout/stderr captured to individual log files
- **Idle Timeout**: Processes killed after inactivity (configurable)
- **Event-Driven**: Real-time status updates via EventEmitter
- **Tag System**: Group and manage related processes
- **Bulk Operations**: Kill multiple processes by tag or all at once

### Queue System (v2.0)
- **Concurrency Control**: Limit simultaneous processes
- **Priority Scheduling**: High-priority tasks run first
- **Pause/Resume**: Control queue processing during maintenance
- **Rate Limiting**: Throttle task execution over time
- **Health Monitoring**: Queue statistics and performance metrics
- **Async API**: Promise-based task completion awaiting

### Reliability
- **Backward Compatible**: v1.x code works unchanged in v2.0
- **Type Safe**: Full TypeScript with comprehensive interfaces
- **Resource Cleanup**: Automatic cleanup of streams, timers, and processes
- **Error Handling**: Graceful failure handling with detailed error info
- **Testing**: Comprehensive test suite with 95%+ coverage

**[More details in Architecture Guide →](./claude/ref/architecture.md)**

## 🏃‍♂️ Development

### Installation

```bash
bun install
```

### Running Tests

```bash
bun test
```

### CLI Usage

```bash
# Start a long-running process
bun run src/cli/start.ts -- sleep 60

# Start with tags for management
bun run src/cli/start.ts --tag web-server --tag production -- nginx

# Run with custom timeout
bun run src/cli/start.ts --timeout 30000 -- build-script.sh
```

**[More details in Migration Guide →](./docs/migration-guide.md)**

## 🔧 Configuration

### Basic Configuration

```typescript
const manager = new ProcessManager({
  defaultLogDir: './logs',
  queue: {
    concurrency: 4,           // Max concurrent tasks
    autoStart: true           // Auto-process queue
  }
});
```

### Advanced Queue Configuration

```typescript
const manager = new ProcessManager({
  queue: {
    concurrency: 8,
    interval: 60000,          // Rate limit window (1 minute)
    intervalCap: 10,          // Max 10 tasks per minute
    timeout: 30000            // Default task timeout
  },
  hooks: {
    onSuccess: [(task) => console.log(`✅ ${task.id} completed`)],
    onFailure: [(task) => console.log(`❌ ${task.id} failed`)]
  }
});
```

**[More details in Queue Usage Guide →](./docs/queue-usage.md)**

## 📊 Queue Management

### Monitoring

```typescript
// Get queue statistics
const stats = manager.getQueueStats();
console.log({
  pending: stats.size,
  running: stats.pending,
  throughput: stats.throughput,
  utilization: stats.utilization
});

// Health monitoring
const health = manager.getHealth();
if (health.status === 'unhealthy') {
  console.log('Issues:', health.issues);
}
```

### Control Operations

```typescript
// Pause processing (running tasks continue)
manager.pauseQueue();

// Resume processing
manager.resumeQueue();

// Clear pending tasks
manager.clearQueue();

// Dynamic scaling
manager.setQueueConcurrency(8);
```

**[More details in Queue Usage Guide →](./docs/queue-usage.md)**

## 🔄 Migration from v1.x

### Zero-Change Migration

Your existing v1.x code works unchanged:

```typescript
// This v1.x code works identically in v2.0
const manager = new ProcessManager();
const task = manager.start({ 
  cmd: ['build', 'production'], 
  logDir: 'logs' 
});
// Task starts immediately, no behavior changes
```

### Gradual Queue Adoption

```typescript
// Phase 1: Enable queue with high concurrency
const manager = new ProcessManager({
  queue: { concurrency: 100 } // Almost like immediate mode
});

// Phase 2: Gradually reduce concurrency
setTimeout(() => manager.setQueueConcurrency(10), 60000);

// Phase 3: Add queue-aware code
if (task.status === 'queued') {
  console.log('Task will start when slot available');
}
```

**[More details in Migration Guide →](./docs/migration-guide.md)**

## 🧪 Testing

The project includes comprehensive test coverage:

- **Unit Tests**: Core functionality, queue operations, error handling
- **Integration Tests**: End-to-end workflows, API compatibility  
- **Performance Tests**: Memory usage, throughput, latency benchmarks
- **Compatibility Tests**: v1.x behavior preservation

```bash
# Run all tests
bun test

# Run specific test file
bun test src/tests/queue-management.test.ts

# Run tests with coverage
bun test --coverage
```

**[More details in Testing Guide →](./claude/ref/testing-guide.md)**

## 📁 Project Structure

```
src/
├── core/
│   ├── ProcessManager.ts     # Main API and orchestration
│   ├── ProcessTask.ts        # Individual process wrapper
│   ├── ProcessQueue.ts       # Queue management
│   ├── TaskHandle.ts         # Advanced task control
│   └── types.ts             # TypeScript definitions
├── cli/
│   └── start.ts             # Command-line interface
└── tests/                   # Comprehensive test suite

docs/                        # User documentation
claude/ref/                  # Technical reference
```

## 🚨 Error Handling

The system provides comprehensive error handling:

```typescript
// Task spawn failures
const task = manager.start({ cmd: ['invalid-command'], logDir: './logs' });
if (task.status === 'start-failed') {
  console.error('Spawn failed:', task.startError);
}

// Process completion errors
manager.registerGlobalHooks({
  onFailure: [(taskInfo) => {
    console.error(`Task ${taskInfo.id} failed with code ${taskInfo.exitCode}`);
  }],
  onTimeout: [(taskInfo) => {
    console.error(`Task ${taskInfo.id} timed out after idle period`);
  }]
});
```

**[More details in Architecture Guide →](./claude/ref/architecture.md)**

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run the test suite: `bun test`
5. Submit a pull request

## 📜 License

This project was created using `bun init` in bun v1.2.12. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

---

**Need help?** Check the [documentation links](#-documentation) above or browse the `docs/` directory for detailed guides and examples.