# Task Manager

A simple task manager for running and managing background processes.

## Installation

To install the dependencies, run:

```bash
bun install
```

## Usage

### Starting a task

To start a new task, use the `start` command:

```bash
bun src/cli/start.ts -- <command> [args]
```

You can also add tags to a task using the `--tag` flag:

```bash
bun src/cli/start.ts --tag my-task -- <command> [args]
```

### Listing running tasks

To list all running tasks, use the `list` command:

```bash
bun src/cli/list.ts
```

### Stopping tasks

To stop all running tasks, use the `killall` command:

```bash
bun src/cli/killAll.ts
```

To stop tasks by tag, use the `kill` command:

```bash
bun src/cli/killByTag.ts --tag my-task
```

## Running tests

To run the tests, use the following command:

```bash
bun test
```
