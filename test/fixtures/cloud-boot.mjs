// Cloud unit-test fixture only. Never use for native acceptance.
import { mock } from 'bun:test';
import * as childProcess from 'node:child_process';
import { promisify } from 'node:util';
const originalExecFile = childProcess.execFile;
const original = promisify(originalExecFile);
const execFile = Object.assign(function (...args) {
  return Reflect.apply(originalExecFile, childProcess, args);
}, {
  [promisify.custom]: async (file, args, options) => {
    if (file === '/usr/sbin/sysctl' && args.join(' ') === '-n kern.bootsessionuuid') {
      return { stdout: '00000000-0000-4000-8000-000000000001\n', stderr: '' };
    }
    return Reflect.apply(original, undefined, [file, args, options]);
  },
});
mock.module('node:child_process', () => ({ ...childProcess, execFile }));
