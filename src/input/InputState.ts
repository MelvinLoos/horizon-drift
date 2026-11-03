import type { DriveAction } from './keybindings';

/**
 * Which drive actions are held. Each press has a source (a key code, a touch pad id), so two
 * inputs driving the same action don't cancel each other: the action stays active until every
 * source has released it.
 */
export class InputState {
  private readonly held = new Map<DriveAction, Set<string>>();

  press(action: DriveAction, source: string): void {
    const sources = this.held.get(action) ?? new Set<string>();
    sources.add(source);
    this.held.set(action, sources);
  }

  release(action: DriveAction, source: string): void {
    this.held.get(action)?.delete(source);
  }

  /** Releases everything, e.g. when the window loses focus and key-up events will never arrive. */
  releaseAll(): void {
    this.held.clear();
  }

  isActive(action: DriveAction): boolean {
    return (this.held.get(action)?.size ?? 0) > 0;
  }
}
