import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TOAST_TIMING, ToastQueue, type Scheduler, type ToastView } from '../../../src/ui/toastQueue';

/** Manual clock: timers only fire when the test advances time. */
class FakeScheduler implements Scheduler {
  time = 0;
  now(): number {
    return this.time;
  }
  private nextId = 1;
  private readonly timers = new Map<number, { at: number; fn: () => void }>();
  setTimeout(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + ms, fn });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.time = due[1].at;
      due[1].fn();
    }
    this.time = target;
  }
}

describe('ToastQueue', () => {
  let clock: FakeScheduler;
  let log: string[];
  let queue: ToastQueue;
  const view: ToastView = {
    show: (m) => log.push(`show:${m}`),
    hide: () => log.push('hide'),
  };

  beforeEach(() => {
    clock = new FakeScheduler();
    log = [];
    queue = new ToastQueue(view, clock);
  });

  it('shows a lone message for holdMs, then hides', () => {
    queue.push('A');
    expect(log).toEqual(['show:A']);
    clock.advance(DEFAULT_TOAST_TIMING.holdMs - 1);
    expect(log).toEqual(['show:A']);
    clock.advance(1);
    expect(log).toEqual(['show:A', 'hide']);
  });

  it('shows simultaneous messages one after another instead of overwriting (BUG-013)', () => {
    queue.push('STATION');
    queue.push('LANDFORM');
    expect(log).toEqual(['show:STATION']);
    clock.advance(DEFAULT_TOAST_TIMING.busyHoldMs);
    expect(log).toEqual(['show:STATION', 'show:LANDFORM']);
    clock.advance(DEFAULT_TOAST_TIMING.holdMs);
    expect(log.at(-1)).toBe('hide');
  });

  it('ignores a duplicate of a waiting message', () => {
    queue.push('A');
    queue.push('B');
    queue.push('B');
    clock.advance(10_000);
    expect(log).toEqual(['show:A', 'show:B', 'hide']);
  });

  it('refreshes the timer when the current message repeats', () => {
    queue.push('A');
    clock.advance(2000);
    queue.push('A');
    clock.advance(2000); // past the original 2600 ms deadline
    expect(log).toEqual(['show:A']);
    clock.advance(700);
    expect(log).toEqual(['show:A', 'hide']);
  });

  it('caps the current message at busyHoldMs since it appeared, not since the next push', () => {
    queue.push('A');
    clock.advance(1000);
    queue.push('B'); // A has been up 1000 ms: 300 ms left
    clock.advance(299);
    expect(log).toEqual(['show:A']);
    clock.advance(1);
    expect(log).toEqual(['show:A', 'show:B']);
  });

  it('does not extend the current message when further messages arrive', () => {
    queue.push('A');
    queue.push('B');
    clock.advance(1000);
    queue.push('C');
    clock.advance(300);
    expect(log).toEqual(['show:A', 'show:B']);
  });

  it('drops the oldest waiting messages beyond maxQueued', () => {
    queue.push('A');
    for (const m of ['B', 'C', 'D', 'E']) queue.push(m);
    clock.advance(60_000);
    expect(log.filter((l) => l.startsWith('show'))).toEqual(['show:A', 'show:D', 'show:E']);
  });

  it('can show again after it has gone idle', () => {
    queue.push('A');
    clock.advance(10_000);
    queue.push('A');
    expect(log).toEqual(['show:A', 'hide', 'show:A']);
  });
});
