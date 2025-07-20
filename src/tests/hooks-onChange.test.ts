// src/tests/hooks-onChange.test.ts
import { ProcessManager } from '../core/ProcessManager';
import { expect, test } from 'bun:test';
import { mkdirSync } from 'fs';

test('onChange hook is called when log file content changes', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hookCalled = false;
  let capturedContent = '';
  let callCount = 0;

  manager.start({
    cmd: ['echo', 'simple test line'],
    logDir: 'logs',
    hooks: {
      onChange: [(taskInfo, newContent) => {
        hookCalled = true;
        capturedContent += newContent;
        callCount++;
      }]
    }
  });

  // Wait for process to complete and file changes to be detected
  await new Promise((r) => setTimeout(r, 1500));

  expect(hookCalled).toBe(true);
  expect(callCount).toBeGreaterThan(0);
  expect(capturedContent).toContain('simple test line');
});

test('onChange hook is called multiple times for multiple outputs', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hookCallCount = 0;
  const capturedContents: string[] = [];

  manager.start({
    cmd: ['bash', '-c', 'printf "line1\\n"; printf "line2\\n"; printf "line3\\n"'],
    logDir: 'logs',
    hooks: {
      onChange: [(taskInfo, newContent) => {
        hookCallCount++;
        capturedContents.push(newContent);
      }]
    }
  });

  await new Promise((r) => setTimeout(r, 1500));

  expect(hookCallCount).toBeGreaterThan(0);
  const allContent = capturedContents.join('');
  expect(allContent).toContain('line1');
  expect(allContent).toContain('line2');
  expect(allContent).toContain('line3');
});

test('onChange hook is not called when no log changes occur', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let changeHookCalled = false;
  let successHookCalled = false;

  manager.start({
    cmd: ['bash', '-c', 'sleep 0.1'], // No output
    logDir: 'logs',
    hooks: {
      onChange: [() => { changeHookCalled = true; }],
      onSuccess: [() => { successHookCalled = true; }]
    }
  });

  await new Promise((r) => setTimeout(r, 500));

  expect(changeHookCalled).toBe(false);
  expect(successHookCalled).toBe(true);
});

test('multiple onChange hooks are called', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hook1Called = false;
  let hook2Called = false;

  manager.start({
    cmd: ['echo', 'test content'],
    logDir: 'logs',
    hooks: {
      onChange: [
        () => { hook1Called = true; },
        () => { hook2Called = true; }
      ]
    }
  });

  await new Promise((r) => setTimeout(r, 500));

  expect(hook1Called).toBe(true);
  expect(hook2Called).toBe(true);
});

test('global onChange hooks work', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let globalHookCalled = false;

  manager.registerGlobalHooks({
    onChange: [() => { globalHookCalled = true; }]
  });

  manager.start({
    cmd: ['echo', 'global test'],
    logDir: 'logs'
  });

  await new Promise((r) => setTimeout(r, 500));

  expect(globalHookCalled).toBe(true);
});

test('onChange hook receives correct task info and content', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let capturedTaskInfo: any = null;
  let capturedContent = '';

  const info = manager.start({
    cmd: ['echo', 'content check'],
    logDir: 'logs',
    hooks: {
      onChange: [(taskInfo, newContent) => {
        capturedTaskInfo = taskInfo;
        capturedContent = newContent;
      }]
    }
  });

  await new Promise((r) => setTimeout(r, 500));

  expect(capturedTaskInfo).toBeTruthy();
  expect(capturedTaskInfo.id).toBe(info.id);
  expect(capturedContent).toContain('content check');
});

test('onChange hook works with stderr output', async () => {
  mkdirSync('logs', { recursive: true });
  
  const manager = new ProcessManager();
  let hookCalled = false;
  let capturedContent = '';

  manager.start({
    cmd: ['bash', '-c', 'echo "error message" >&2'],
    logDir: 'logs',
    hooks: {
      onChange: [(taskInfo, newContent) => {
        hookCalled = true;
        capturedContent = newContent;
      }]
    }
  });

  await new Promise((r) => setTimeout(r, 500));

  expect(hookCalled).toBe(true);
  expect(capturedContent).toContain('error message');
});