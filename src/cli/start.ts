import { ProcessManager } from '../core/ProcessManager';
import { mkdirSync } from 'fs';
const manager = new ProcessManager();

// rudimentary arg parse
const [, , ...cmd] = process.argv;
if (!cmd.length) {
  console.error('Usage: taskman start -- <command> [args]');
  process.exit(1);
}

mkdirSync('logs', { recursive: true });
const info = manager.start({ cmd, logDir: 'logs' });
console.log('started', info);