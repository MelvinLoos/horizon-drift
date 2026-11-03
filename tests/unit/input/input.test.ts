// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from '../../../src/core/store';
import { InputController, type InputCallbacks } from '../../../src/input/InputController';
import { InputState } from '../../../src/input/InputState';
import { COMMAND_KEYS, DRIVE_KEYS } from '../../../src/input/keybindings';

function key(type: 'keydown' | 'keyup', code: string, repeat = false): void {
  window.dispatchEvent(new KeyboardEvent(type, { code, repeat }));
}
function pointer(
  el: Element,
  type: string,
  init: { id?: number; x?: number; y?: number; button?: number } = {},
): void {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, {
    pointerId: init.id ?? 1,
    pointerType: 'touch',
    button: init.button ?? 0,
    clientX: init.x ?? 0,
    clientY: init.y ?? 0,
  });
  el.dispatchEvent(e);
}

describe('store', () => {
  it('merges patches, notifies once per change and unsubscribes', () => {
    const store = createStore({ a: 1, b: 'x' });
    const seen: number[] = [];
    const off = store.subscribe((s) => seen.push(s.a));
    store.set({ a: 2 });
    store.set({ a: 2 }); // unchanged
    expect(store.get()).toEqual({ a: 2, b: 'x' });
    off();
    store.set({ a: 3 });
    expect(seen).toEqual([2]);
  });

  it('passes the previous state to listeners', () => {
    const store = createStore({ n: 0 });
    const prev: number[] = [];
    store.subscribe((_, p) => prev.push(p.n));
    store.set({ n: 5 });
    expect(prev).toEqual([0]);
  });
});

describe('InputState', () => {
  it('keeps an action active until every source released it', () => {
    const s = new InputState();
    s.press('throttle', 'KeyW');
    s.press('throttle', 'pad:throttle');
    s.release('throttle', 'KeyW');
    expect(s.isActive('throttle')).toBe(true);
    s.release('throttle', 'pad:throttle');
    expect(s.isActive('throttle')).toBe(false);
  });

  it('releaseAll clears everything', () => {
    const s = new InputState();
    s.press('left', 'KeyA');
    s.releaseAll();
    expect(s.isActive('left')).toBe(false);
  });

  it('binds every drive key to an action and no key to both maps', () => {
    for (const code of Object.keys(DRIVE_KEYS)) expect(COMMAND_KEYS[code]).toBeUndefined();
  });
});

describe('InputController', () => {
  let cb: { [K in keyof InputCallbacks]: ReturnType<typeof vi.fn> };
  let look: HTMLElement;
  let pad: HTMLElement;
  let controller: InputController;

  beforeEach(() => {
    cb = { onCommand: vi.fn(), onLookStart: vi.fn(), onLookMove: vi.fn(), onLookEnd: vi.fn() };
    look = document.createElement('canvas');
    look.setPointerCapture = vi.fn();
    pad = document.createElement('button');
    document.body.append(look, pad);
    controller = new InputController(cb as unknown as InputCallbacks, {
      lookTarget: look,
      touchPads: [{ element: pad, action: 'throttle' }],
    });
  });
  afterEach(() => {
    controller.dispose();
    document.body.replaceChildren();
  });

  it('maps drive keys to held actions', () => {
    key('keydown', 'KeyW');
    expect(controller.state.isActive('throttle')).toBe(true);
    key('keyup', 'KeyW');
    expect(controller.state.isActive('throttle')).toBe(false);
  });

  it('fires a command once per press, ignoring auto-repeat (BUG-003)', () => {
    key('keydown', 'KeyV');
    key('keydown', 'KeyV', true);
    key('keydown', 'KeyV', true);
    key('keyup', 'KeyV');
    key('keydown', 'KeyV');
    expect(cb.onCommand.mock.calls).toEqual([['camera'], ['camera']]);
  });

  it('releases held keys on window blur and when the tab is hidden', () => {
    key('keydown', 'KeyD');
    window.dispatchEvent(new Event('blur'));
    expect(controller.state.isActive('right')).toBe(false);

    key('keydown', 'KeyD');
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    expect(controller.state.isActive('right')).toBe(false);
  });

  it.each(['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'])(
    'releases a touch pad on %s (BUG-005)',
    (type) => {
      pointer(pad, 'pointerdown');
      expect(controller.state.isActive('throttle')).toBe(true);
      pointer(pad, type);
      expect(controller.state.isActive('throttle')).toBe(false);
    },
  );

  it('a touch pad and a key drive the same action independently', () => {
    key('keydown', 'KeyW');
    pointer(pad, 'pointerdown');
    pointer(pad, 'pointerup');
    expect(controller.state.isActive('throttle')).toBe(true);
  });

  it('looks around with touch pointers (BUG-014)', () => {
    pointer(look, 'pointerdown', { x: 10, y: 10 });
    pointer(look, 'pointermove', { x: 25, y: 4 });
    pointer(look, 'pointerup');
    expect(cb.onLookStart).toHaveBeenCalledOnce();
    expect(cb.onLookMove).toHaveBeenCalledWith(15, -6);
    expect(cb.onLookEnd).toHaveBeenCalledOnce();
  });

  it('ignores other pointers and ends a look on cancel or release-all', () => {
    pointer(look, 'pointerdown', { id: 1 });
    pointer(look, 'pointermove', { id: 2, x: 50 });
    expect(cb.onLookMove).not.toHaveBeenCalled();
    controller.releaseAll();
    expect(cb.onLookEnd).toHaveBeenCalledOnce();
  });

  it('stops listening after dispose', () => {
    controller.dispose();
    key('keydown', 'KeyW');
    expect(controller.state.isActive('throttle')).toBe(false);
  });
});
