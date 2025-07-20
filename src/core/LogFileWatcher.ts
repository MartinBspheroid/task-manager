// src/core/LogFileWatcher.ts
import { watch, FSWatcher } from 'chokidar';
import { readFileSync, existsSync, statSync } from 'fs';
import type { TaskInfo, OnChangeHook } from './types';

export class LogFileWatcher {
  private watcher?: FSWatcher;
  private lastPosition = 0;
  private debounceTimeout?: NodeJS.Timeout;
  private debounceMs = 100; // Debounce rapid changes
  private checkInterval?: NodeJS.Timeout;
  private cleanupTimeout?: NodeJS.Timeout;

  constructor(
    private taskInfo: TaskInfo,
    private onChangeHooks: OnChangeHook[],
    private hookManager: any // Avoid circular import
  ) {}

  start(): void {
    if (!existsSync(this.taskInfo.logFile)) {
      // Wait for file to be created
      this.watchForFileCreation();
      return;
    }

    this.initializePosition();
    this.startWatching();
  }

  stop(): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    if (this.cleanupTimeout) {
      clearTimeout(this.cleanupTimeout);
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
  }

  private watchForFileCreation(): void {
    const dirPath = this.taskInfo.logFile.substring(0, this.taskInfo.logFile.lastIndexOf('/'));
    
    this.watcher = watch(dirPath, {
      ignoreInitial: true,
      persistent: false,
    });

    this.watcher.on('add', (filePath) => {
      if (filePath === this.taskInfo.logFile) {
        this.watcher?.close();
        // Give the file a moment to be written to
        setTimeout(() => {
          this.initializePosition();
          this.startWatching();
        }, 50);
      }
    });

    // Also check periodically if the file appears
    this.checkInterval = setInterval(() => {
      if (existsSync(this.taskInfo.logFile)) {
        if (this.checkInterval) {
          clearInterval(this.checkInterval);
        }
        this.watcher?.close();
        setTimeout(() => {
          this.initializePosition();
          this.startWatching();
        }, 50);
      }
    }, 50);

    // Stop checking after 5 seconds
    this.cleanupTimeout = setTimeout(() => {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
      }
    }, 5000);
  }

  private initializePosition(): void {
    try {
      // Start from position 0 to catch all content
      this.lastPosition = 0;
    } catch (error) {
      console.error(`Error initializing log file position for ${this.taskInfo.id}:`, error);
    }
  }

  private startWatching(): void {
    this.watcher = watch(this.taskInfo.logFile, {
      ignoreInitial: true,
      persistent: false,
    });

    this.watcher.on('change', () => {
      this.debouncedHandleChange();
    });

    this.watcher.on('error', (error) => {
      console.error(`Log file watcher error for ${this.taskInfo.id}:`, error);
    });
    
    // Also check if there's already content in the file
    setTimeout(() => {
      this.handleFileChange();
    }, 10);
  }

  private debouncedHandleChange(): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    this.debounceTimeout = setTimeout(() => {
      this.handleFileChange();
    }, this.debounceMs);
  }

  private handleFileChange(): void {
    try {
      if (!existsSync(this.taskInfo.logFile)) {
        return;
      }

      const stats = statSync(this.taskInfo.logFile);
      const currentSize = stats.size;

      if (currentSize <= this.lastPosition) {
        // File was truncated or unchanged
        this.lastPosition = currentSize;
        return;
      }

      // Read new content using simple readFileSync with slice
      const fullContent = readFileSync(this.taskInfo.logFile, 'utf8');
      const newContent = fullContent.slice(this.lastPosition);
      
      if (newContent.trim()) {
        // Execute onChange hooks asynchronously
        void this.hookManager.executeOnChange(this.taskInfo, newContent, this.onChangeHooks);
      }

      this.lastPosition = currentSize;
    } catch (error) {
      console.error(`Error reading log file changes for ${this.taskInfo.id}:`, error);
    }
  }
}