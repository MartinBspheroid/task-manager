import { ProcessManager } from '../core/ProcessManager';
import { mkdirSync } from 'fs';
const manager = new ProcessManager();

// Parse command line arguments
const args = process.argv.slice(2);
let tags: string[] = [];
let cmd: string[] = [];

// Look for --tag arguments
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
  } else {
    cmd = args.slice(i);
    break;
  }
}

if (!cmd.length) {
  console.error('Usage: taskman start [--tag tagname] -- <command> [args]');
  process.exit(1);
}

mkdirSync('logs', { recursive: true });
const info = manager.start({ 
  cmd, 
  logDir: 'logs',
  tags: tags.length > 0 ? tags : undefined
});
console.log('started', info);