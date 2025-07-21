#!/usr/bin/env bun

import { ProcessManager } from './src/core/ProcessManager';
import { glob } from 'glob';
import * as path from 'path';
import type { TaskInfo } from './src/core/types';

interface TestResult {
  file: string;
  success: boolean;
  exitCode: number | null;
  duration: number;
  output: string;
  error?: string;
}

class TestRunner {
  private manager: ProcessManager;
  private results: TestResult[] = [];
  private timeoutMs = 10000; // 10 seconds

  constructor() {
    this.manager = new ProcessManager({
      defaultLogDir: 'test-runner-logs',
      queue: {
        concurrency: 4, // Run up to 4 tests in parallel
        emitQueueEvents: true
      },
      hooks: {
        onSuccess: [(taskInfo: TaskInfo) => {
          this.handleTestCompletion(taskInfo);
        }],
        onFailure: [(taskInfo: TaskInfo) => {
          this.handleTestCompletion(taskInfo);
        }],
        onTimeout: [(taskInfo: TaskInfo) => {
          this.handleTestTimeout(taskInfo);
        }],
        onTaskStartFail: [(taskInfo: TaskInfo) => {
          this.handleTestFailure(taskInfo);
        }]
      }
    });

    // Listen for queue events to track progress
    this.manager.on('queue:idle', () => {
      console.log('✓ All tests completed');
      this.printSummary();
    });
  }

  async findTestFiles(): Promise<string[]> {
    try {
      const testFiles = await glob('src/tests/*.test.ts', { 
        cwd: process.cwd(),
        absolute: true 
      });
      return testFiles.sort();
    } catch (error) {
      console.error('Failed to find test files:', error);
      return [];
    }
  }

  async runTests(): Promise<void> {
    console.log('🧪 Task Manager Test Runner');
    console.log('═══════════════════════════════════════\n');

    // Ensure test-runner-logs directory exists
    const fs = require('fs');
    fs.mkdirSync('test-runner-logs', { recursive: true });

    const testFiles = await this.findTestFiles();
    
    if (testFiles.length === 0) {
      console.log('❌ No test files found in src/tests/');
      return;
    }

    console.log(`📋 Found ${testFiles.length} test files:`);
    testFiles.forEach(file => {
      const relativePath = path.relative(process.cwd(), file);
      console.log(`   • ${relativePath}`);
    });
    console.log();

    console.log('🚀 Starting parallel test execution...\n');

    // Start all tests
    testFiles.map(testFile => {
      const relativePath = path.relative(process.cwd(), testFile);
      console.log(`⏳ Queuing: ${relativePath}`);
      
      return this.manager.start({
        cmd: ['bun', 'test', testFile],
        logDir: 'test-runner-logs',
        idleTimeoutMs: this.timeoutMs,
        tags: ['test'],
        queue: {
          priority: 0 // Normal priority for all tests
        }
      });
    });

    // Wait for all tests to complete
    await this.manager.waitForQueueIdle();
    
    // Clean shutdown
    await this.manager.shutdown({ timeout: 5000, force: true });
  }

  private handleTestCompletion(taskInfo: TaskInfo): void {
    const testFile = this.extractTestFileFromCommand(taskInfo.cmd);
    const duration = (taskInfo.exitedAt || Date.now()) - taskInfo.startedAt;
    const success = taskInfo.exitCode === 0;
    
    const result: TestResult = {
      file: testFile,
      success,
      exitCode: taskInfo.exitCode ?? null,
      duration,
      output: '', // Will be populated later if needed
      error: success ? undefined : 'Test failed with non-zero exit code'
    };

    this.results.push(result);
    
    const relativePath = path.relative(process.cwd(), testFile);
    const statusIcon = success ? '✅' : '❌';
    const timeStr = `${duration}ms`;
    
    console.log(`${statusIcon} ${relativePath} (${timeStr})`);
  }

  private handleTestTimeout(taskInfo: TaskInfo): void {
    const testFile = this.extractTestFileFromCommand(taskInfo.cmd);
    const duration = Date.now() - taskInfo.startedAt;
    
    const result: TestResult = {
      file: testFile,
      success: false,
      exitCode: null,
      duration,
      output: this.getTaskOutput(taskInfo.id),
      error: `Test timed out after ${this.timeoutMs}ms`
    };

    this.results.push(result);
    
    const relativePath = path.relative(process.cwd(), testFile);
    console.log(`⏰ ${relativePath} (TIMEOUT after ${this.timeoutMs}ms)`);
  }

  private handleTestFailure(taskInfo: TaskInfo): void {
    const testFile = this.extractTestFileFromCommand(taskInfo.cmd);
    
    const result: TestResult = {
      file: testFile,
      success: false,
      exitCode: null,
      duration: 0,
      output: '',
      error: taskInfo.startError?.message || 'Failed to start test'
    };

    this.results.push(result);
    
    const relativePath = path.relative(process.cwd(), testFile);
    console.log(`💥 ${relativePath} (FAILED TO START: ${result.error})`);
  }

  private extractTestFileFromCommand(command: string[]): string {
    // Find the .test.ts file in the command
    const testFile = command.find(arg => arg.endsWith('.test.ts'));
    return testFile || 'unknown';
  }

  private getTaskOutput(taskId: string): string {
    try {
      // Try to read the log file for this task
      const logPath = path.join('test-runner-logs', `${taskId}.log`);
      const fs = require('fs');
      if (fs.existsSync(logPath)) {
        return fs.readFileSync(logPath, 'utf-8');
      }
    } catch (error) {
      // Ignore errors reading log files - may not exist yet
    }
    return '';
  }

  private printSummary(): void {
    console.log('\n📊 Test Summary');
    console.log('═══════════════════════════════════════');
    
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const total = this.results.length;
    
    console.log(`Total: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (this.results.length > 0) {
      const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
      const avgDuration = Math.round(totalDuration / this.results.length);
      console.log(`⏱️  Average duration: ${avgDuration}ms`);
      console.log(`🏃 Total execution time: ${totalDuration}ms`);
    }

    if (failed > 0) {
      console.log('\n❌ Failed tests:');
      this.results
        .filter(r => !r.success)
        .forEach(result => {
          const relativePath = path.relative(process.cwd(), result.file);
          console.log(`   • ${relativePath}: ${result.error || `Exit code ${result.exitCode}`}`);
        });
    }

    console.log('\n' + (failed === 0 ? '🎉 All tests passed!' : `⚠️  ${failed} test(s) failed`));
    
    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
  }
}

// Run the test runner
async function main() {
  const runner = new TestRunner();
  
  try {
    await runner.runTests();
  } catch (error) {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (import.meta.main) {
  main().catch(console.error);
}

export { TestRunner };