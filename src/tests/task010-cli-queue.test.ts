// src/tests/task010-cli-queue.test.ts

import { test, expect, describe } from 'bun:test';
import { join } from 'path';

const CLI_PATH = join(__dirname, '../cli/queue.ts');

async function runCLI(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', CLI_PATH, ...args], {
    stdout: 'pipe',
    stderr: 'pipe'
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ]);

  const exitCode = await proc.exited;

  return {
    stdout,
    stderr,
    exitCode
  };
}

describe('Task 010: CLI Queue Commands', () => {
  test('queue help should show available commands', async () => {
    const result = await runCLI(['help']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Queue Management Commands');
    expect(result.stdout).toContain('status, stats');
    expect(result.stdout).toContain('health');
    expect(result.stdout).toContain('pause');
    expect(result.stdout).toContain('resume');
    expect(result.stdout).toContain('clear');
    expect(result.stdout).toContain('cancel');
    expect(result.stdout).toContain('concurrency');
    expect(result.stdout).toContain('shutdown');
  });

  test('queue status should show queue statistics', async () => {
    const result = await runCLI(['status']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Queue Statistics');
    expect(result.stdout).toContain('Size:');
    expect(result.stdout).toContain('Pending:');
    expect(result.stdout).toContain('Paused:');
    expect(result.stdout).toContain('Total Added:');
    expect(result.stdout).toContain('Total Completed:');
    expect(result.stdout).toContain('Average Wait Time:');
    expect(result.stdout).toContain('Throughput:');
    expect(result.stdout).toContain('Utilization:');
  });

  test('queue health should show health status', async () => {
    const result = await runCLI(['health']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Queue Health:');
    expect(result.stdout).toMatch(/Queue Health: (HEALTHY|DEGRADED|UNHEALTHY)/);
    expect(result.stdout).toContain('Memory Usage:');
    expect(result.stdout).toContain('Processing Rate:');
  });

  test('queue pause should pause the queue', async () => {
    const result = await runCLI(['pause']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Queue paused');
  });

  test('queue resume should resume the queue', async () => {
    const result = await runCLI(['resume']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Queue resumed');
  });

  test('queue clear should clear the queue', async () => {
    const result = await runCLI(['clear']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Queue cleared');
  });

  test('queue list running should show running tasks', async () => {
    const result = await runCLI(['list', 'running']);
    
    expect(result.exitCode).toBe(0);
    // Should either show tasks or "No running tasks"
    expect(result.stdout).toMatch(/(Running Tasks:|No running tasks)/);
  });

  test('queue list queued should show queued tasks', async () => {
    const result = await runCLI(['list', 'queued']);
    
    expect(result.exitCode).toBe(0);
    // Should either show tasks or "No queued tasks"
    expect(result.stdout).toMatch(/(Queued Tasks:|No queued tasks)/);
  });

  test('queue concurrency should set concurrency limit', async () => {
    const result = await runCLI(['concurrency', '5']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Concurrency set to 5');
  });

  test('queue rate-limit should set rate limiting', async () => {
    const result = await runCLI(['rate-limit', '1000', '10']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Rate limit set to 10 tasks per 1000ms');
  });

  test('invalid command should show error', async () => {
    const result = await runCLI(['invalid-command']);
    
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown command: invalid-command');
  });

  test('queue cancel with invalid predicate should show error', async () => {
    const result = await runCLI(['cancel', 'invalid:predicate']);
    
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid predicate');
  });

  test('queue cancel all should attempt to cancel all tasks', async () => {
    const result = await runCLI(['cancel', 'all']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Cancelled');
  });

  test('queue concurrency with invalid number should show error', async () => {
    const result = await runCLI(['concurrency', 'invalid']);
    
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Usage: queue concurrency <number>');
  });

  test('queue rate-limit with invalid parameters should show error', async () => {
    const result = await runCLI(['rate-limit', 'invalid', 'params']);
    
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Usage: queue rate-limit <interval_ms> <cap>');
  });

  test('queue shutdown should initiate graceful shutdown', async () => {
    const result = await runCLI(['shutdown', '1000']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Initiating graceful shutdown');
    expect(result.stdout).toContain('Shutdown complete');
  });
});