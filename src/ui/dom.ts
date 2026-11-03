/** Typed DOM lookup that fails loudly instead of returning null. */
export function requireEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing DOM element #${id}`);
  return el;
}
