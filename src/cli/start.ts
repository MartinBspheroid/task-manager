import { ProcessManager } from '../core/ProcessManager';
import { PRIORITY } from '../core/types';
import { mkdirSync } from 'fs';
const manager = new ProcessManager();

// Parse command line arguments
const args = process.argv.slice(2);
let tags: string[] = [];
let immediate = false;
let priority: number | undefined = undefined;
let cmd: string[] = [];

// Look for --tag, --immediate, and --priority arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tag' && i + 1 < args.length) {
    const tagValue = args[i + 1];
    if (tagValue) {
      tags.push(tagValue);
    }
    i++; // skip the tag value
  } else if (args[i]?.startsWith('--tag=')) {
    const tagValue = args[i]?.substring(6);
    if (tagValue) {
      tags.push(tagValue);
    }
  } else if (args[i] === '--immediate') {
    immediate = true;
  } else if (args[i] === '--priority' && i + 1 < args.length) {
    const priorityValue = args[i + 1];
    if (priorityValue) {
      if (priorityValue.toUpperCase() in PRIORITY) {
        priority = PRIORITY[priorityValue.toUpperCase() as keyof typeof PRIORITY];
      } else {
        priority = parseInt(priorityValue);
        if (isNaN(priority)) {
          console.error('Invalid priority value. Use a number or: CRITICAL, HIGH, NORMAL, LOW, BATCH');
          process.exit(1);
        }
      }
    }
    i++; // skip the priority value
  } else if (args[i]?.startsWith('--priority=')) {
    const priorityValue = args[i]?.substring(11);
    if (priorityValue) {
      if (priorityValue.toUpperCase() in PRIORITY) {
        priority = PRIORITY[priorityValue.toUpperCase() as keyof typeof PRIORITY];
      } else {
        priority = parseInt(priorityValue);
        if (isNaN(priority)) {
          console.error('Invalid priority value. Use a number or: CRITICAL, HIGH, NORMAL, LOW, BATCH');
          process.exit(1);
        }
      }
    }
  } else {
    cmd = args.slice(i);
    break;
  }
}

if (!cmd.length) {
  console.error('Usage: taskman start [--tag tagname] [--immediate] [--priority priority] -- <command> [args]');
  console.error('Priority can be: CRITICAL, HIGH, NORMAL, LOW, BATCH or a number');
  process.exit(1);
}

mkdirSync('logs', { recursive: true });

// Build queue options
let queueOptions: any = undefined;
if (immediate || priority !== undefined) {
  queueOptions = {};
  if (immediate) {
    queueOptions.immediate = true;
  }
  if (priority !== undefined) {
    queueOptions.priority = priority;
  }
}

const info = manager.start({ 
  cmd, 
  logDir: 'logs',
  tags: tags.length > 0 ? tags : undefined,
  queue: queueOptions
});

console.log('started', info);
if (priority !== undefined) {
  const priorityName = priority >= 1000 ? 'CRITICAL' : 
                      priority >= 100 ? 'HIGH' : 
                      priority > 0 ? 'HIGH' :
                      priority === 0 ? 'NORMAL' : 
                      priority >= -100 ? 'LOW' : 'BATCH';
  console.log(`Priority: ${priority} (${priorityName})`);
}