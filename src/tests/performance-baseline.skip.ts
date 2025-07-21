// src/tests/performance-baseline.test.ts
import { expect, test, beforeEach, afterEach } from 'bun:test';
import { ProcessManager } from '../core/ProcessManager';
import { setupTestEnvironment, teardownTestEnvironment, createTestManager, TEST_LOG_DIR } from './utils/test-helpers';

beforeEach(setupTestEnvironment);
afterEach(teardownTestEnvironment);

test('ProcessManager.start() latency baseline', () => {
  const manager = new ProcessManager();
  const iterations = 100;
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    const info = manager.start({
      cmd: ['echo', `test-${i}`],
      logDir: TEST_LOG_DIR
    });
    const end = process.hrtime.bigint();
    
    const durationMs = Number(end - start) / 1_000_000;
    times.push(durationMs);
    
    // Verify expected behavior
    expect(info.status).toBe('running');
    expect(info.pid).toBeGreaterThan(0);
    expect(info.startedAt).toBeGreaterThan(0);
  }
  
  // Calculate statistics
  const sorted = times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const p50 = sorted[Math.floor(iterations * 0.5)]!;
  const p95 = sorted[Math.floor(iterations * 0.95)]!;
  const p99 = sorted[Math.floor(iterations * 0.99)]!;
  const max = sorted[iterations - 1]!;
  
  console.log('ProcessManager.start() Performance Baseline:');
  console.log(`  Iterations: ${iterations}`);
  console.log(`  Mean: ${mean.toFixed(2)}ms`);
  console.log(`  P50: ${p50.toFixed(2)}ms`);
  console.log(`  P95: ${p95.toFixed(2)}ms`);
  console.log(`  P99: ${p99.toFixed(2)}ms`);
  console.log(`  Max: ${max.toFixed(2)}ms`);
  
  // Performance assertions (based on API contract)
  expect(p95).toBeLessThan(100); // 95th percentile < 100ms
  expect(mean).toBeLessThan(50);  // Mean < 50ms
  
  // Cleanup
  manager.killAll();
});

test('ProcessManager.list() performance baseline', async () => {
  const manager = new ProcessManager();
  const taskCount = 1000;
  
  // Create many tasks (mix of running and completed)
  for (let i = 0; i < taskCount; i++) {
    if (i < 100) {
      // Long running tasks
      manager.start({
        cmd: ['sleep', '10'],
        logDir: TEST_LOG_DIR
      });
    } else {
      // Quick tasks that will complete
      manager.start({
        cmd: ['echo', `quick-${i}`],
        logDir: TEST_LOG_DIR
      });
    }
  }
  
  // Wait a bit for quick tasks to complete
  await new Promise(r => setTimeout(r, 200));
  
  // Measure list() performance
  const iterations = 100;
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    const tasks = manager.list();
    const end = process.hrtime.bigint();
    
    const durationMs = Number(end - start) / 1_000_000;
    times.push(durationMs);
    
    expect(tasks.length).toBe(taskCount);
  }
  
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const p95 = times.sort((a, b) => a - b)[Math.floor(iterations * 0.95)]!;
  
  console.log('ProcessManager.list() Performance Baseline:');
  console.log(`  Task count: ${taskCount}`);
  console.log(`  Mean: ${mean.toFixed(2)}ms`);
  console.log(`  P95: ${p95.toFixed(2)}ms`);
  
  // Performance assertions
  expect(p95).toBeLessThan(10); // P95 < 10ms for 1000 tasks
  expect(mean).toBeLessThan(5);  // Mean < 5ms
  
  // Cleanup
  manager.killAll();
});

test('ProcessManager.kill() performance baseline', () => {
  const manager = new ProcessManager();
  const taskCount = 100;
  const taskIds: string[] = [];
  
  // Create tasks to kill
  for (let i = 0; i < taskCount; i++) {
    const info = manager.start({
      cmd: ['sleep', '60'],
      logDir: TEST_LOG_DIR
    });
    taskIds.push(info.id);
  }
  
  // Measure kill() performance
  const times: number[] = [];
  
  for (const taskId of taskIds) {
    const start = process.hrtime.bigint();
    manager.kill(taskId);
    const end = process.hrtime.bigint();
    
    const durationMs = Number(end - start) / 1_000_000;
    times.push(durationMs);
  }
  
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const p95 = times.sort((a, b) => a - b)[Math.floor(taskCount * 0.95)]!;
  
  console.log('ProcessManager.kill() Performance Baseline:');
  console.log(`  Task count: ${taskCount}`);
  console.log(`  Mean: ${mean.toFixed(2)}ms`);
  console.log(`  P95: ${p95.toFixed(2)}ms`);
  
  // Performance assertions
  expect(p95).toBeLessThan(50); // P95 < 50ms
  expect(mean).toBeLessThan(25); // Mean < 25ms
});

test('Memory usage baseline', async () => {
  const manager = new ProcessManager();
  const iterations = 500;
  
  // Measure initial memory
  const initialMem = process.memoryUsage();
  
  // Create many tasks
  for (let i = 0; i < iterations; i++) {
    manager.start({
      cmd: ['echo', `memory-test-${i}`],
      logDir: TEST_LOG_DIR
    });
  }
  
  // Wait for tasks to complete
  await new Promise(r => setTimeout(r, 500));
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  // Measure final memory
  const finalMem = process.memoryUsage();
  const heapIncrease = finalMem.heapUsed - initialMem.heapUsed;
  const memoryPerTask = heapIncrease / iterations;
  
  console.log('Memory Usage Baseline:');
  console.log(`  Tasks created: ${iterations}`);
  console.log(`  Heap increase: ${(heapIncrease / 1024).toFixed(2)} KB`);
  console.log(`  Memory per task: ${(memoryPerTask / 1024).toFixed(2)} KB`);
  console.log(`  Initial heap: ${(initialMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Final heap: ${(finalMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  
  // Memory assertions (tasks should be relatively lightweight)
  expect(memoryPerTask).toBeLessThan(10 * 1024); // < 10KB per task
});

// test('Concurrent task creation performance', () => {
//   const manager = new ProcessManager();
//   const batchSize = 50;
//   const batches = 10;
  
//   console.log('Concurrent Task Creation Baseline:');
  
//   for (let batch = 0; batch < batches; batch++) {
//     const start = process.hrtime.bigint();
    
//     // Create batch of tasks rapidly
//     for (let i = 0; i < batchSize; i++) {
//       manager.start({
//         cmd: ['echo', `batch-${batch}-task-${i}`],
//         logDir: TEST_LOG_DIR
//       });
//     }
    
//     const end = process.hrtime.bigint();
//     const durationMs = Number(end - start) / 1_000_000;
//     const tasksPerSecond = (batchSize / durationMs) * 1000;
    
//     console.log(`  Batch ${batch + 1}: ${batchSize} tasks in ${durationMs.toFixed(2)}ms (${tasksPerSecond.toFixed(0)} tasks/sec)`);
    
//     // Should be able to create at least 100 tasks per second
//     expect(tasksPerSecond).toBeGreaterThan(100);
//   }
  
//   // Verify all tasks were created
//   const allTasks = manager.list();
//   expect(allTasks.length).toBe(batchSize * batches);
  
//   // Cleanup
//   manager.killAll();
// });