import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { SimulatorObserver } from '../src/simulator-observer.js';

test('damage observers share attachment, distinguish timeout from quiet, and release pending waiters', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sim-stage-observer-'));
  const helper = join(directory, 'observer');
  await writeFile(helper, `#!${process.execPath}
const mode = process.argv[2];
if (mode === 'fail') process.exit(1);
console.error(JSON.stringify({event:'attached'}));
process.stdin.on('data', data => {
 for (const line of String(data).trim().split('\\n')) {
  const [command, id] = line.split(' ');
  if (command === 's' && mode !== 'hang') console.error(JSON.stringify({event:'settled', requestId:Number(id), quiet:mode !== 'animated'}));
 }
});
setInterval(() => {}, 1000);
`, { mode: 0o755 });
  const observer = new SimulatorObserver(pathToFileURL(helper));
  t.after(async () => { observer.close(); await rm(directory, { recursive: true, force: true }); });
  assert.equal(observer.waitForIdle('quiet'), undefined);
  const first = observer.start('quiet', 'quiet');
  assert.equal(observer.start('quiet', 'quiet'), first);
  await first;
  assert.equal(await observer.waitForIdle('quiet'), true);
  await observer.start('animated', 'animated');
  assert.equal(await observer.waitForIdle('animated'), false);
  await observer.start('hang', 'hang');
  const pending = observer.waitForIdle('hang')!;
  const rejected = assert.rejects(pending, /observer stopped/);
  observer.closeSession('hang');
  await rejected;
  await assert.rejects(observer.start('failed', 'fail'), /observer stopped/);
});
