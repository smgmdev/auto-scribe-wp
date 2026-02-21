// Global popup stack for layered Esc key handling.
// Only the topmost popup should close when Esc is pressed.

type CloseCallback = () => void;

interface PopupEntry {
  id: string;
  close: CloseCallback;
}

const stack: PopupEntry[] = [];

export function pushPopup(id: string, close: CloseCallback) {
  // Remove existing entry with same id to avoid duplicates
  const idx = stack.findIndex(e => e.id === id);
  if (idx !== -1) stack.splice(idx, 1);
  stack.push({ id, close });
}

export function removePopup(id: string) {
  const idx = stack.findIndex(e => e.id === id);
  if (idx !== -1) stack.splice(idx, 1);
}

export function closeTopPopup(): boolean {
  if (stack.length === 0) return false;
  const top = stack[stack.length - 1];
  // Remove from stack BEFORE calling close(), because close() triggers
  // React state updates whose cleanup effects also call removePopup().
  // If we pop() after close(), we'd remove the NEXT popup in the stack.
  stack.pop();
  top.close();
  return true;
}

export function getStackSize() {
  return stack.length;
}
