/* Layer stack: the Android back button (browser history) closes the top-most panel / editor / fullscreen first.
   Capacitor navigates the WebView back when it can and only leaves the app when nothing is left, so one history entry
   is pushed per open layer and popped again when the layer is closed from the UI. */
const stack = [];
let ignore = 0;      // programmatic history.back() calls whose popstate must be swallowed
let queued = 0;      // pushStates waiting for those to finish (history changes are asynchronous)
let timer = 0;

const push = () => { try { history.pushState({ avp: 1 }, ''); } catch (e) { /* ignore */ } };
function release() {
  clearTimeout(timer); timer = 0; ignore = 0;
  while (queued > 0) { queued--; push(); }
}

export function openLayer(name, onClose) {
  if (stack.some(l => l.name === name)) return;
  stack.push({ name, onClose });
  if (ignore > 0) queued++; else push();
}

/* Closes a layer from the UI (buttons, gestures) and runs its onClose once. */
export function closeLayer(name) {
  const i = stack.findIndex(l => l.name === name);
  if (i < 0) return false;
  const [layer] = stack.splice(i, 1);
  if (i === stack.length) {                    // it was the top one: drop its history entry too
    ignore++;
    try { history.back(); } catch (e) { ignore--; }
    clearTimeout(timer); timer = setTimeout(release, 400);
  }
  layer.onClose();
  return true;
}

export function closeTop() {
  const top = stack[stack.length - 1];
  return top ? closeLayer(top.name) : false;
}

window.addEventListener('popstate', () => {
  if (ignore > 0) { ignore--; if (ignore === 0) release(); return; }
  const layer = stack.pop();
  if (layer) layer.onClose();
});
