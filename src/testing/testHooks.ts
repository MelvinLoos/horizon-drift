import type { Clock, WebGLRenderer } from 'three';

/**
 * Contract between the app and the e2e/visual tests (`tests/e2e/support/driver.ts`).
 * Only installed when `import.meta.env.MODE !== 'production'`, so production bundles never ship it.
 */
export interface HdHooks {
  setBiome(index: number): void;
  setSkyTime(p: number, frozen: boolean): void;
  setCamera(index: number): void;
  hideIgnitionOverlay(): void;
  /**
   * Runs exactly `count` frames synchronously with a fixed 1/60 s timestep and draws only the
   * last one. Use it with the fake clock paused, so the app's own requestAnimationFrame loop never
   * interleaves: page load leaks a few ms of real time into the fake clock, and rAF-driven
   * stepping would carry that into every frame's dt.
   */
  advanceFrames(count: number): void;
  framesRendered(): number;
}

declare global {
  interface Window {
    __HD__?: HdHooks;
  }
}

/** Phase 1 shape of the app internals the hooks need; narrows as modules are extracted. */
export interface LegacyInternals {
  state: {
    currentBiomeIdx: number;
    targetBiomeIdx: number;
    biomeLerp: number;
    celestialTime: number;
    celestialSpeed: number;
    cameraMode: number;
  };
  BIOMES: readonly { name: string; dotColor: string }[];
  CAMERA_MODES: readonly string[];
  renderer: WebGLRenderer;
  clock: Clock;
  animate: () => void;
  /** App only: mirrors label changes into the HUD store (the legacy page has none). */
  setHud?: (patch: { biomeName?: string; biomeDotColor?: string; cameraLabel?: string }) => void;
}

/**
 * Installs `window.__HD__`.
 *
 * Must stay **self-contained** (no references to anything outside its body): the e2e driver also
 * injects this exact function into the legacy prototype via `installTestHooks.toString()`, so both
 * targets share one implementation.
 */
export function installTestHooks({
  state,
  BIOMES,
  CAMERA_MODES,
  renderer,
  clock,
  animate,
  setHud,
}: LegacyInternals): void {
  const el = (id: string): HTMLElement => {
    const node = document.getElementById(id);
    if (!node) throw new Error(`#${id} not found`);
    return node;
  };

  let frames = 0;
  const render = renderer.render.bind(renderer);
  renderer.render = (...args) => {
    frames++;
    render(...args);
  };

  window.__HD__ = {
    framesRendered: () => frames,

    advanceFrames(count) {
      const step = 1 / 60;
      // Fixed timestep. three r128's getElapsedTime() calls getDelta(), so it is made read-only.
      clock.getDelta = () => {
        clock.elapsedTime += step;
        return step;
      };
      clock.getElapsedTime = () => clock.elapsedTime;
      // animate() re-queues itself via requestAnimationFrame; stepping must not add extra loops.
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = () => 0;
      // Draw only the last frame: simulation and camera smoothing run outside render(), and
      // software WebGL in CI is far too slow to draw every intermediate frame.
      const draw = renderer.render.bind(renderer);
      renderer.render = () => undefined;
      try {
        for (let i = 0; i < count; i++) {
          if (i === count - 1) renderer.render = draw;
          animate();
        }
      } finally {
        renderer.render = draw;
        window.requestAnimationFrame = raf;
        // Remove the own-property overrides so Clock.prototype's methods apply again.
        Reflect.deleteProperty(clock, 'getDelta');
        Reflect.deleteProperty(clock, 'getElapsedTime');
        clock.oldTime = performance.now();
      }
    },

    setBiome(i) {
      const biome = BIOMES[i];
      if (!biome) throw new RangeError(`no biome ${i}`);
      state.currentBiomeIdx = i;
      state.targetBiomeIdx = i;
      state.biomeLerp = 1;
      el('current-biome-label').textContent = biome.name;
      const dot = el('biome-indicator-dot');
      dot.style.backgroundColor = biome.dotColor;
      dot.style.boxShadow = `0 0 10px ${biome.dotColor}`;
      setHud?.({ biomeName: biome.name, biomeDotColor: biome.dotColor });
    },

    setSkyTime(p, frozen) {
      state.celestialTime = p;
      if (frozen) state.celestialSpeed = 0;
    },

    setCamera(i) {
      state.cameraMode = i;
      el('camera-label').textContent = CAMERA_MODES[i] ?? '';
      setHud?.({ cameraLabel: CAMERA_MODES[i] ?? '' });
    },

    hideIgnitionOverlay() {
      el('ignition-overlay').style.display = 'none';
    },
  };
}
