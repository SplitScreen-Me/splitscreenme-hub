import { describe, expect, it } from 'vitest';
import { Mutex } from './semaphore';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('upload mutex', () => {
  it('runs one task at a time, in order', async () => {
    const m = new Mutex();
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`${name}:start`);
      await sleep(ms);
      log.push(`${name}:end`);
      return name;
    };
    const [a, b] = await Promise.all([m.run(1000, task('a', 30)), m.run(1000, task('b', 5))]);
    expect(a).toEqual({ value: 'a' });
    expect(b).toEqual({ value: 'b' });
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('gives up after the wait time without blocking later tasks', async () => {
    const m = new Mutex();
    const slow = m.run(1000, () => sleep(80));
    const impatient = m.run(10, async () => 'never');
    const patient = m.run(1000, async () => 'later');
    expect(await impatient).toBeNull();
    await slow;
    expect(await patient).toEqual({ value: 'later' });
  });

  it('releases the lock when a task throws', async () => {
    const m = new Mutex();
    await expect(m.run(100, async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await m.run(100, async () => 1)).toEqual({ value: 1 });
  });
});
