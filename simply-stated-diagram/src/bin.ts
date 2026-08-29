#!/usr/bin/env node
import { CliError, runCli } from './cli';

try {
  process.stdout.write(runCli(process.argv.slice(2)));
} catch (error) {
  const message = error instanceof CliError ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
