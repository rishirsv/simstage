import { mkdir, mkdtemp, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

/** A Sim Stage server process holding an Xcode device session. */
export interface SessionHolder { pid: number; sessionId: string; since: string }
export interface SharedSession {
  key: string;
  deviceId: string;
  deviceName: string;
  /** Started by a tool other than Sim Stage, which Sim Stage never ends. */
  foreign?: boolean;
  holders: SessionHolder[];
}
/** The device a Sim Stage process connected most recently; viewers follow it. */
export interface RegistryFocus { deviceId: string; deviceName: string; pid: number; at: string }
interface RegistryState { boot: string; sessions: Record<string, SharedSession>; created: string[]; focus?: RegistryFocus }

const alive = (pid: number) => {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
};

const uuid = /^[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}$/i;
let bootIdentity: Promise<string> | undefined;
/** macOS changes this UUID on reboot, independently of wall-clock adjustments. */
function currentBoot(): Promise<string> {
  return bootIdentity ??= promisify(execFile)('/usr/sbin/sysctl', ['-n', 'kern.bootsessionuuid'], { encoding: 'utf8' }).then(({ stdout }) => {
    const boot = stdout.trim();
    if (!uuid.test(boot)) throw new Error('macOS returned no boot session UUID.');
    return boot;
  });
}
interface LockOwner { pid: number; boot: string }

/**
 * Xcode allows one interaction session per device, and any process that
 * knows a session's key can use or end it. Each chat or window runs its own
 * Sim Stage server, so the servers record which of them hold each session in
 * a per-user file: they share a device, and only the last to leave ends it.
 */
export class SessionRegistry {
  // Hosts launch MCP servers with different environments, some without TMPDIR,
  // so the shared file lives under the home directory every server can find.
  constructor(private readonly directory = join(homedir(), 'Library', 'Caches', 'sim-stage'), private readonly pid = process.pid) {}

  private get file() { return join(this.directory, 'sessions.json'); }

  private async read(): Promise<RegistryState> {
    let state: Partial<RegistryState>;
    try { state = JSON.parse(await readFile(this.file, 'utf8')) as Partial<RegistryState>; }
    catch { state = {}; }
    // Xcode sessions and process IDs end with the boot; created simulators do not.
    const boot = await currentBoot();
    const sameBoot = state.boot === boot;
    const sessions: Record<string, SharedSession> = {};
    for (const [key, session] of Object.entries(sameBoot ? state.sessions ?? {} : {})) {
      // A crashed server leaves its hold behind; the device stays usable by whoever joins next.
      const holders = (session.holders ?? []).filter(holder => alive(holder.pid));
      if (holders.length) sessions[key] = { ...session, holders };
    }
    return { boot: sameBoot ? state.boot! : boot, sessions, created: state.created ?? [], ...(sameBoot && state.focus ? { focus: state.focus } : {}) };
  }

  /** Atomic populated-directory locks carry a live process owner, never an age lease. */
  private async locked<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const boot = await currentBoot();
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = join(this.directory, `${name}.lock`);
    const candidate = await mkdtemp(join(this.directory, '.lock-'));
    const owner = randomUUID();
    await writeFile(join(candidate, owner), JSON.stringify({ pid: process.pid, boot } satisfies LockOwner), { mode: 0o600 });
    let acquired = false;
    try {
      for (;;) {
        try { await rename(candidate, lock); acquired = true; break; }
        catch (error) {
          if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
          const owners = await readdir(lock).catch(() => []);
          for (const token of owners) {
            const source = await readFile(join(lock, token), 'utf8').catch(error => {
              if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
              throw error;
            });
            if (source === undefined) continue;
            const holder = JSON.parse(source) as LockOwner;
            if (!Number.isInteger(holder.pid) || holder.pid <= 0 || typeof holder.boot !== 'string' || !uuid.test(holder.boot)) throw new Error('Device session lock owner is invalid.');
            if (holder.boot !== boot || !alive(holder.pid)) await unlink(join(lock, token)).catch(() => {});
          }
          // A successor is populated before becoming visible. Removing only an
          // empty directory cannot remove its lock, even with concurrent reclaimers.
          await rmdir(lock).catch(() => {});
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      return await operation();
    } finally {
      const directory = acquired ? lock : candidate;
      await unlink(join(directory, owner)).catch(() => {});
      await rmdir(directory).catch(() => {});
    }
  }

  /** Native start/join/end and their holder update are one device transition. */
  lifecycle<T>(deviceId: string, transition: () => Promise<T>): Promise<T> {
    const name = `device-${createHash('sha256').update(deviceId).digest('hex')}`;
    return this.locked(name, transition);
  }

  private async update<T>(change: (state: RegistryState) => T): Promise<T> {
    return this.locked('sessions', async () => {
      const state = await this.read();
      const result = change(state);
      const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
      await rename(temporary, this.file);
      return result;
    });
  }

  async find(key: string): Promise<SharedSession | undefined> {
    return (await this.read()).sessions[key];
  }

  async forDevice(deviceId: string): Promise<SharedSession[]> {
    return Object.values((await this.read()).sessions).filter(session => session.deviceId === deviceId);
  }

  /** Forgets a session for every holder, once it has ended. */
  async drop(key: string): Promise<void> {
    await this.update(state => { delete state.sessions[key]; });
  }

  async hold(session: Omit<SharedSession, 'holders'>, sessionId: string): Promise<void> {
    await this.update(state => {
      const entry = state.sessions[session.key] ??= { ...session, holders: [] };
      entry.holders = entry.holders.filter(holder => !(holder.pid === this.pid && holder.sessionId === sessionId));
      entry.holders.push({ pid: this.pid, sessionId, since: new Date().toISOString() });
    });
  }

  /** Drops this server's hold. The session should end only when it was the last holder of a Sim Stage session. */
  async release(key: string, sessionId: string): Promise<{ known: boolean; last: boolean; foreign: boolean }> {
    return this.update(state => {
      const entry = state.sessions[key];
      if (!entry) return { known: false, last: false, foreign: false };
      entry.holders = entry.holders.filter(holder => !(holder.pid === this.pid && holder.sessionId === sessionId));
      if (!entry.holders.length) delete state.sessions[key];
      return { known: true, last: !entry.holders.length, foreign: Boolean(entry.foreign) };
    });
  }

  /** Sessions other Sim Stage servers hold, such as another chat or window. */
  async elsewhere(): Promise<SharedSession[]> {
    return Object.values((await this.read()).sessions)
      .map(session => ({ ...session, holders: session.holders.filter(holder => holder.pid !== this.pid) }))
      .filter(session => session.holders.length);
  }

  async setFocus(deviceId: string, deviceName: string): Promise<void> {
    await this.update(state => { state.focus = { deviceId, deviceName, pid: this.pid, at: new Date().toISOString() }; });
  }

  async focus(): Promise<RegistryFocus | undefined> {
    return (await this.read()).focus;
  }

  async clearFocus(deviceId: string): Promise<void> {
    await this.update(state => { if (state.focus?.deviceId === deviceId) delete state.focus; });
  }

  async markCreated(deviceId: string): Promise<void> {
    await this.update(state => { if (!state.created.includes(deviceId)) state.created.push(deviceId); });
  }

  async createdDevices(): Promise<string[]> {
    return (await this.read()).created;
  }

  async forgetCreated(deviceId: string): Promise<void> {
    await this.update(state => { state.created = state.created.filter(id => id !== deviceId); });
  }
}
