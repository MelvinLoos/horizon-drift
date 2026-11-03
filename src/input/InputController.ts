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
      if (command && !e.repeat) this.callbacks.onCommand(command);
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
    if (this.looking) this.endLook();
  }

  dispose(): void {
    this.releaseAll();
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
  }

  private looking = false;

  private bindPad({ element, action }: TouchPad): void {
    const source = `pad:${action}`;
    const down = (e: Event): void => {
      e.preventDefault();
      this.state.press(action, source);
    };
    const up = (): void => {
      this.state.release(action, source);
    };
    this.listen(element, 'pointerdown', down);
    // pointercancel (system gesture), pointerleave (finger slid off) and lostpointercapture all
    // end the press: the old touchend/mouseup handlers missed them (BUG-005).
    for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'] as const) {
      this.listen(element, type, up);
    }
  }

  private bindLook(target: HTMLElement): void {
    let last = { x: 0, y: 0 };
    let activeId: number | null = null;
    this.listen(target, 'pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      activeId = e.pointerId;
      last = { x: e.clientX, y: e.clientY };
      target.setPointerCapture(e.pointerId);
      this.looking = true;
      this.callbacks.onLookStart();
    });
    this.listen(target, 'pointermove', (e) => {
      if (e.pointerId !== activeId) return;
      this.callbacks.onLookMove(e.clientX - last.x, e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      this.endLook();
    };
    this.listen(target, 'pointerup', end);
    this.listen(target, 'pointercancel', end);
  }

  private endLook(): void {
    this.looking = false;
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
