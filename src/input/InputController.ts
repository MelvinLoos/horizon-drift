import { COMMAND_KEYS, DRIVE_KEYS, type Command, type DriveAction } from './keybindings';
import { InputState } from './InputState';

export interface InputCallbacks {
  onCommand(command: Command): void;
  onLookStart(): void;
  /** Pointer movement in CSS pixels while looking around. */
  onLookMove(dx: number, dy: number): void;
  onLookEnd(): void;
}

interface ListenerEventMap {
  keydown: KeyboardEvent;
  keyup: KeyboardEvent;
  blur: Event;
  visibilitychange: Event;
  pointerdown: PointerEvent;
  pointermove: PointerEvent;
  pointerup: PointerEvent;
  pointercancel: PointerEvent;
  pointerleave: PointerEvent;
  lostpointercapture: PointerEvent;
}

export interface TouchPad {
  element: HTMLElement;
  action: DriveAction;
}

/**
 * Turns keyboard and pointer input into drive state, commands and look-around deltas.
 * Everything is released on blur, tab hide and pointer cancel, so a missed key-up or a
 * cancelled touch can never leave the car accelerating or steering.
 */
export class InputController {
  readonly state = new InputState();
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly callbacks: InputCallbacks,
    options: { lookTarget: HTMLElement; touchPads: readonly TouchPad[] },
  ) {
    this.listen(window, 'keydown', (e) => {
      const drive = DRIVE_KEYS[e.code];
      if (drive) this.state.press(drive, e.code);
      const command = COMMAND_KEYS[e.code];
      // Held keys auto-repeat keydown; commands must fire once per physical press.
      if (command && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) this.callbacks.onCommand(command);
    });
    this.listen(window, 'keyup', (e) => {
      const drive = DRIVE_KEYS[e.code];
      if (drive) this.state.release(drive, e.code);
    });
    this.listen(window, 'blur', () => {
      this.releaseAll();
    });
    this.listen(document, 'visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });

    for (const pad of options.touchPads) this.bindPad(pad);
    this.bindLook(options.lookTarget);
  }

  releaseAll(): void {
    this.state.releaseAll();
    if (this.activeLookId !== null) this.endLook();
  }

  dispose(): void {
    this.releaseAll();
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
  }

  private activeLookId: number | null = null;
  private lastLook = { x: 0, y: 0 };

  private bindPad({ element, action }: TouchPad): void {
    const sourceOf = (e: PointerEvent): string => `pad:${action}:${e.pointerId}`;
    this.listen(element, 'pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      this.state.press(action, sourceOf(e));
    });
    // pointercancel (system gesture), pointerleave (finger slid off) and lostpointercapture all
    // end the press: the old touchend/mouseup handlers missed them (BUG-005). Sources are per
    // pointer, so lifting one of two fingers on a pad keeps the action held.
    for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'] as const) {
      this.listen(element, type, (e) => {
        this.state.release(action, sourceOf(e));
      });
    }
  }

  private bindLook(target: HTMLElement): void {
    this.listen(target, 'pointerdown', (e) => {
      if (this.activeLookId !== null) return; // a second finger doesn't take over the gesture
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.activeLookId = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
      target.setPointerCapture(e.pointerId);
      this.callbacks.onLookStart();
    });
    this.listen(target, 'pointermove', (e) => {
      if (e.pointerId !== this.activeLookId) return;
      this.callbacks.onLookMove(e.clientX - this.lastLook.x, e.clientY - this.lastLook.y);
      this.lastLook = { x: e.clientX, y: e.clientY };
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId === this.activeLookId) this.endLook();
    };
    this.listen(target, 'pointerup', end);
    this.listen(target, 'pointercancel', end);
    this.listen(target, 'lostpointercapture', end);
  }

  private endLook(): void {
    this.activeLookId = null;
    this.callbacks.onLookEnd();
  }

  private listen<K extends keyof ListenerEventMap>(
    target: EventTarget,
    type: K,
    handler: (e: ListenerEventMap[K]) => void,
  ): void {
    const listener = handler as EventListener;
    target.addEventListener(type, listener);
    this.cleanups.push(() => {
      target.removeEventListener(type, listener);
    });
  }
}
