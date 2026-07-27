// Bun's view of whether the app window is focused, updated from Electrobun focus/blur events
// (wired in index.ts). Defaults to true because the window is focused at launch. The completion
// hooks read this to fire only when you are away.
let focused = true;

export function setWindowFocused(value: boolean): void {
  focused = value;
}

export function isWindowFocused(): boolean {
  return focused;
}
