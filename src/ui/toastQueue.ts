/** Timer functions, injectable so tests can drive time. */
export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** Monotonic milliseconds. */
  now(): number;
}

export interface ToastView {
  show(message: string): void;
  hide(): void;
}

export interface ToastTiming {
  /** How long a message stays when nothing is waiting behind it. */
  readonly holdMs: number;
  /** How long it stays when more messages are queued (so none is skipped unseen). */
  readonly busyHoldMs: number;
  /** Waiting messages beyond this are dropped, oldest first. */
  readonly maxQueued: number;
}

export const DEFAULT_TOAST_TIMING: ToastTiming = { holdMs: 2600, busyHoldMs: 1300, maxQueued: 2 };

/**
 * Shows toasts one after another instead of overwriting each other (BUG-013: a landform toast
 * used to erase the station toast that fired at the same moment). A message equal to the one on
 * screen or already waiting is ignored.
 */
export class ToastQueue {
  private readonly queue: string[] = [];
  private current: string | null = null;
  private timer: unknown = null;
  private shownAt = 0;

  constructor(
    private readonly view: ToastView,
    private readonly scheduler: Scheduler,
    private readonly timing: ToastTiming = DEFAULT_TOAST_TIMING,
  ) {}

  push(message: string): void {
    if (message === this.current) {
      // The same action again: keep its feedback on screen for a full hold from now.
      this.restartTimer(this.queue.length > 0 ? this.timing.busyHoldMs : this.timing.holdMs);
      return;
    }
    // A repeat of a waiting message moves to the back, so the last state shown is the latest one.
    const waiting = this.queue.indexOf(message);
    if (waiting >= 0) {
      this.queue.splice(waiting, 1);
      this.queue.push(message);
      return;
    }
    if (this.current === null) {
      this.display(message);
      return;
    }
    const wasIdle = this.queue.length === 0;
    this.queue.push(message);
    while (this.queue.length > this.timing.maxQueued) this.queue.shift();
    if (wasIdle) {
      // Something is waiting now: cap the current message at busyHoldMs *since it appeared*.
      const elapsed = this.scheduler.now() - this.shownAt;
      this.restartTimer(Math.max(0, this.timing.busyHoldMs - elapsed));
    }
  }

  private display(message: string): void {
    this.current = message;
    this.shownAt = this.scheduler.now();
    this.view.show(message);
    this.restartTimer(this.queue.length > 0 ? this.timing.busyHoldMs : this.timing.holdMs);
  }

  private restartTimer(ms: number): void {
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer);
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      const next = this.queue.shift();
      if (next === undefined) {
        this.current = null;
        this.view.hide();
      } else {
        this.display(next);
      }
    }, ms);
  }
}
