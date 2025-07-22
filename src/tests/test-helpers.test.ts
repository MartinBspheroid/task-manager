// src/tests/test-helpers.test.ts
import { expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync } from 'fs';
import { 
  waitForStatus, 
  waitForTaskCount, 
  waitForFileContent, 
  createTestManager,
  EventWaiter,
  waitForRunningCount,
  cleanupTestLogs,
  TEST_LOG_DIR
} from './utils/test-helpers';

beforeEach(() => {
  // Clean up any existing test logs
  cleanupTestLogs();
  mkdirSync(TEST_LOG_DIR, { recursive: true });
});

afterEach(() => {
  cleanupTestLogs();
});

test('waitForStatus waits for task to reach target status', async () => {
  const manager = createTestManager();
  
  const task = manager.start({
    cmd: ['echo', 'test'],
    logDir: TEST_LOG_DIR
  });
  
  // Should start as running and then exit
  expect(task.status).toBe('running');
  
  // Wait for it to exit
  await waitForStatus(manager, task.id, 'exited', 2000);
  
  const updatedTask = manager.list().find(t => t.id === task.id);
  expect(updatedTask?.status).toBe('exited');
});

test('waitForStatus times out when condition not met', async () => {
  const manager = createTestManager();
  
  const task = manager.start({
    cmd: ['sleep', '10'],
    logDir: TEST_LOG_DIR
  });
  
  // Should timeout trying to wait for 'exited' status
  await expect(
    waitForStatus(manager, task.id, 'exited', 100)
  ).rejects.toThrow(/Timeout waiting for task.*to reach status exited/);
  
  // Cleanup
  manager.kill(task.id);
});

test('waitForTaskCount waits for predicate to be true', async () => {
  const manager = createTestManager();
  
  // Start multiple tasks
  manager.start({ cmd: ['sleep', '5'], logDir: TEST_LOG_DIR });
  manager.start({ cmd: ['sleep', '5'], logDir: TEST_LOG_DIR });
  manager.start({ cmd: ['echo', 'quick'], logDir: TEST_LOG_DIR });
  
  // Wait for 2 running tasks (after quick one exits)
  await waitForTaskCount(
    manager,
    tasks => tasks.filter(t => t.status === 'running').length === 2,
    2000
  );
  
  const runningTasks = manager.listRunning();
  expect(runningTasks.length).toBe(2);
  
  // Cleanup
  manager.killAll();
});

test('waitForRunningCount convenience function works', async () => {
  const manager = createTestManager();
  
  manager.start({ cmd: ['sleep', '5'], logDir: TEST_LOG_DIR });
  manager.start({ cmd: ['sleep', '5'], logDir: TEST_LOG_DIR });
  
  await waitForRunningCount(manager, 2, 1000);
  
  expect(manager.listRunning().length).toBe(2);
  
  manager.killAll();
});

test('waitForFileContent waits for file content condition', async () => {
  const testFile = `${TEST_LOG_DIR}/content-test.txt`;
  
  // Start with empty file
  writeFileSync(testFile, '');
  
  // Start waiting for content
  const waitPromise = waitForFileContent(
    testFile,
    content => content.includes('test content'),
    2000
  );
  
  // Add content after a delay
  setTimeout(() => {
    writeFileSync(testFile, 'test content here');
  }, 100);
  
  // Should resolve when content matches
  await waitPromise;
  
  expect(true).toBe(true); // Test passed if we get here
});

test('waitForFileContent times out when condition not met', async () => {
  const testFile = `${TEST_LOG_DIR}/timeout-test.txt`;
  writeFileSync(testFile, 'wrong content');
  
  await expect(
    waitForFileContent(
      testFile,
      content => content.includes('missing content'),
      100
    )
  ).rejects.toThrow(/Timeout waiting for file content condition/);
});

test('waitForFileContent handles non-existent files', async () => {
  const testFile = `${TEST_LOG_DIR}/nonexistent.txt`;
  
  // Start waiting
  const waitPromise = waitForFileContent(
    testFile,
    content => content.includes('new content'),
    1000
  );
  
  // Create file after delay
  setTimeout(() => {
    writeFileSync(testFile, 'new content added');
  }, 200);
  
  await waitPromise;
  expect(true).toBe(true);
});

test('EventWaiter resolves when event is emitted', async () => {
  const waiter = new EventWaiter<string>();
  
  // Emit after delay
  setTimeout(() => {
    waiter.emit('test value');
  }, 50);
  
  const result = await waiter.wait(1000);
  expect(result).toBe('test value');
});

test('EventWaiter times out when no event emitted', async () => {
  const waiter = new EventWaiter<string>();
  
  await expect(
    waiter.wait(100)
  ).rejects.toThrow('EventWaiter timeout');
});

test('createTestManager creates working manager', () => {
  const manager = createTestManager();
  
  const task = manager.start({
    cmd: ['echo', 'test'],
    logDir: TEST_LOG_DIR
  });
  
  expect(task.id).toBeTruthy();
  expect(task.status).toBe('running');
});

test('performance: utilities use efficient polling', async () => {
  const manager = createTestManager();
  
  const task = manager.start({
    cmd: ['echo', 'performance test'],
    logDir: TEST_LOG_DIR
  });
  
  const start = Date.now();
  await waitForStatus(manager, task.id, 'exited', 1000);
  const elapsed = Date.now() - start;
  
  // Should complete quickly (much less than 1 second)
  expect(elapsed).toBeLessThan(500);
});