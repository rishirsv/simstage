// Source-level baseline: never connects to a device or starts video capture.
// Run after build: node --import tsx scripts/baseline.mjs > baseline.json
import { readFile, stat } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { summarizeHierarchy } from '../src/elements.ts';

const fixture = await readFile(new URL('../test/fixtures/settings-hierarchy.txt', import.meta.url), 'utf8');
for (let i = 0; i < 100; i++) summarizeHierarchy(fixture, { width: 402, height: 874 });
const iterations = 1000;
const started = performance.now();
for (let i = 0; i < iterations; i++) summarizeHierarchy(fixture, { width: 402, height: 874 });
const hierarchyMs = (performance.now() - started) / iterations;
const trials = [];
for (let i = 0; i < 5; i++) {
  const client = new Client({ name: 'source-baseline', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [new URL('../plugins/apple-device-hub/dist/server.js', import.meta.url).pathname], stderr: 'pipe' });
  try {
    const start = performance.now();
    await client.connect(transport, { timeout: 15000 });
    const initializedMs = performance.now() - start;
    const { tools } = await client.listTools();
    const resourceStart = performance.now();
    const resource = await client.readResource({ uri: 'ui://apple-device-hub/viewer' });
    trials.push({ initializedMs, resourceMs: performance.now() - resourceStart, toolCount: tools.length, viewerUtf8Bytes: Buffer.byteLength(resource.contents[0].text) });
  } finally { await client.close(); }
}
const sizes = {};
for (const file of ['app.js', 'app.css', 'server.js', 'simulator-stream']) sizes[file] = (await stat(new URL(`../packages/apple-device-hub-mcp/dist/${file}`, import.meta.url))).size;
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch, hierarchy: { fixture: 'settings-hierarchy.txt', iterations, meanMs: hierarchyMs }, trials, runtimeBytes: sizes, limits: 'Warm dependencies and OS caches. No real-device, input-to-photon, decoder, host-rendering, CPU, RSS, or network baseline.' }, null, 2));
