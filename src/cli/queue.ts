#!/usr/bin/env bun

import { ProcessManager } from '../core/ProcessManager';

const manager = new ProcessManager({
  queue: { emitQueueEvents: true }
});

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

function printQueueStats() {
  const stats = manager.getQueueStats();
  console.log('Queue Statistics:');
  console.log(`  Size: ${stats.size} (waiting)`);
  console.log(`  Pending: ${stats.pending} (running)`);
  console.log(`  Paused: ${stats.paused}`);
  console.log(`  Total Added: ${stats.totalAdded}`);
  console.log(`  Total Completed: ${stats.totalCompleted}`);
  console.log(`  Total Failed: ${stats.totalFailed}`);
  console.log(`  Total Cancelled: ${stats.totalCancelled}`);
  console.log(`  Average Wait Time: ${Math.round(stats.averageWaitTime)}ms`);
  console.log(`  Average Run Time: ${Math.round(stats.averageRunTime)}ms`);
  console.log(`  Throughput: ${stats.throughput.toFixed(2)} tasks/sec`);
  console.log(`  Utilization: ${stats.utilization.toFixed(1)}%`);
  
  if (stats.intervalRemaining !== undefined) {
    console.log(`  Rate Limit Remaining: ${stats.intervalRemaining}`);
  }
}

function printQueueHealth() {
  const health = manager.getHealth();
  console.log(`Queue Health: ${health.status.toUpperCase()}`);
  
  if (health.issues.length > 0) {
    console.log('Issues:');
    health.issues.forEach(issue => console.log(`  - ${issue}`));
  } else {
    console.log('No issues detected');
  }
  
  console.log(`Memory Usage: ${Math.round(health.memoryUsage / 1024 / 1024)}MB`);
  console.log(`Processing Rate: ${health.processingRate.toFixed(2)} tasks/sec`);
  console.log(`Average Wait Time: ${Math.round(health.averageWaitTimeWindow)}ms`);
  console.log(`Last Check: ${new Date(health.lastCheck).toLocaleString()}`);
}

function printTasks(type: 'queued' | 'running') {
  const tasks = type === 'queued' ? manager.getQueuedTasks() : manager.getRunningTasks();
  
  if (tasks.length === 0) {
    console.log(`No ${type} tasks`);
    return;
  }
  
  console.log(`${type.charAt(0).toUpperCase() + type.slice(1)} Tasks:`);
  tasks.forEach(task => {
    const duration = Date.now() - task.startedAt;
    const tags = task.tags?.length ? ` [${task.tags.join(', ')}]` : '';
    console.log(`  ${task.id}: ${task.cmd.join(' ')}${tags} (${Math.round(duration / 1000)}s)`);
  });
}

async function cancelTasksByPredicate(predicate: string) {
  let predicateFunction: (task: any) => boolean;
  
  try {
    // Create a safe predicate function from the string
    if (predicate.startsWith('tag:')) {
      const tag = predicate.substring(4);
      predicateFunction = (task) => task.tags?.includes(tag) || false;
    } else if (predicate.startsWith('cmd:')) {
      const cmd = predicate.substring(4);
      predicateFunction = (task) => task.cmd.join(' ').includes(cmd);
    } else if (predicate === 'all') {
      predicateFunction = () => true;
    } else {
      console.error('Invalid predicate. Use format: tag:tagname, cmd:command, or all');
      process.exit(1);
    }
  } catch (error) {
    console.error('Invalid predicate:', error);
    process.exit(1);
  }
  
  const cancelledIds = await manager.cancelTasks(predicateFunction);
  console.log(`Cancelled ${cancelledIds.length} tasks:`);
  cancelledIds.forEach(id => console.log(`  ${id}`));
}

async function main() {
  switch (command) {
    case 'status':
    case 'stats':
      printQueueStats();
      break;
      
    case 'health':
      printQueueHealth();
      break;
      
    case 'pause':
      manager.pauseQueue();
      console.log('Queue paused');
      break;
      
    case 'resume':
      manager.resumeQueue();
      console.log('Queue resumed');
      break;
      
    case 'clear':
      manager.clearQueue();
      console.log('Queue cleared');
      break;
      
    case 'list':
      const listType = args[1] as 'queued' | 'running' || 'running';
      if (listType !== 'queued' && listType !== 'running') {
        console.error('Usage: queue list [queued|running]');
        process.exit(1);
      }
      printTasks(listType);
      break;
      
    case 'cancel':
      const predicate = args[1];
      if (!predicate) {
        console.error('Usage: queue cancel <predicate>');
        console.error('Examples:');
        console.error('  queue cancel tag:production');
        console.error('  queue cancel cmd:sleep');
        console.error('  queue cancel all');
        process.exit(1);
      }
      await cancelTasksByPredicate(predicate);
      break;
      
    case 'concurrency':
      const limitStr = args[1];
      if (!limitStr) {
        console.error('Usage: queue concurrency <number>');
        process.exit(1);
      }
      const limit = parseInt(limitStr);
      if (isNaN(limit) || limit < 1) {
        console.error('Usage: queue concurrency <number>');
        process.exit(1);
      }
      manager.setConcurrency(limit);
      console.log(`Concurrency set to ${limit}`);
      break;
      
    case 'rate-limit':
      const intervalStr = args[1];
      const capStr = args[2];
      if (!intervalStr || !capStr) {
        console.error('Usage: queue rate-limit <interval_ms> <cap>');
        process.exit(1);
      }
      const interval = parseInt(intervalStr);
      const cap = parseInt(capStr);
      if (isNaN(interval) || isNaN(cap) || interval < 1 || cap < 1) {
        console.error('Usage: queue rate-limit <interval_ms> <cap>');
        process.exit(1);
      }
      manager.setRateLimit(interval, cap);
      console.log(`Rate limit set to ${cap} tasks per ${interval}ms`);
      break;
      
    case 'shutdown':
      const timeout = args[1] ? parseInt(args[1]) : 30000;
      const force = args.includes('--force');
      const cancelPending = !args.includes('--no-cancel');
      
      console.log('Initiating graceful shutdown...');
      await manager.shutdown({ timeout, force, cancelPending });
      console.log('Shutdown complete');
      break;
      
    case 'help':
    case undefined:
      console.log('Queue Management Commands:');
      console.log('  status, stats     Show queue statistics');
      console.log('  health           Show queue health status');
      console.log('  pause            Pause queue processing');
      console.log('  resume           Resume queue processing');
      console.log('  clear            Clear pending tasks');
      console.log('  list [type]      List tasks (queued|running, default: running)');
      console.log('  cancel <pred>    Cancel tasks matching predicate');
      console.log('                   Examples: tag:prod, cmd:sleep, all');
      console.log('  concurrency <n>  Set concurrency limit');
      console.log('  rate-limit <ms> <cap>  Set rate limiting');
      console.log('  shutdown [timeout] [--force] [--no-cancel]');
      console.log('                   Graceful shutdown with optional timeout');
      console.log('  help             Show this help');
      break;
      
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Use "queue help" for available commands');
      process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});