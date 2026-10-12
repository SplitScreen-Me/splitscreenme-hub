/**
 * One package processed at a time (single instance, small server). Others wait in line up to `waitMs`,
 * then get `null` (the route answers 503).
 */
export class Mutex {
  private tail: Promise<void> = Promise.resolve();
  private waiting = 0;

  get queued(): number {
    return this.waiting;
  }

  async run<T>(waitMs: number, task: () => Promise<T>): Promise<{ value: T } | null> {
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    const before = this.tail;
    this.tail = before.then(() => mine);
    this.waiting++;
    let timer: NodeJS.Timeout | undefined;
    const acquired = await Promise.race([
      before.then(() => true),
      new Promise<false>((r) => (timer = setTimeout(() => r(false), waitMs))),
    ]);
    clearTimeout(timer);
    this.waiting--;
    if (!acquired) {
      // Give up our turn without blocking the ones queued after us.
      void before.then(release);
      return null;
    }
    try {
      return { value: await task() };
    } finally {
      release();
    }
  }
}

const holder = globalThis as unknown as { __ssmUploadMutex?: Mutex };
export const uploadMutex = (holder.__ssmUploadMutex ??= new Mutex());
