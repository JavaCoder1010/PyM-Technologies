// Drag and drop with pointer events (works with mouse, pen and touch).
// Draggable elements carry data-drag="<kind>" and data-id; drop targets carry
// data-drop. Clicking without moving is left alone, so the select-then-click
// alternative keeps working (and is the keyboard-accessible way).
import { suppressNextClick } from './dom.js';

const THRESHOLD = 6; // px before a press becomes a drag

/**
 * @param {(source: { kind: string, id: string }, target: HTMLElement) => void} onDrop
 */
export function installDrag(onDrop) {
  let press = null; // { el, kind, id, x, y, pointerId }
  let ghost = null;
  let over = null;

  const setOver = (el) => {
    if (over === el) return;
    over?.classList.remove('is-drop-target');
    over = el;
    over?.classList.add('is-drop-target');
  };

  const end = () => {
    ghost?.remove();
    ghost = null;
    setOver(null);
    press?.el.classList.remove('is-dragging');
    document.body.classList.remove('is-dragging-any');
    press = null;
  };

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = /** @type {HTMLElement} */ (e.target).closest('[data-drag]');
    if (!el) return;
    press = { el, kind: el.dataset.drag, id: el.dataset.id, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  });

  document.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.pointerId) return;
    if (!ghost) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < THRESHOLD) return;
      ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.textContent = press.el.querySelector('.seat-name, .chip-name, .seat-label')?.textContent ?? '';
      document.body.append(ghost);
      press.el.classList.add('is-dragging');
      document.body.classList.add('is-dragging-any');
    }
    e.preventDefault();
    ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]');
    setOver(target && target !== press.el ? /** @type {HTMLElement} */ (target) : null);
  });

  document.addEventListener('pointerup', (e) => {
    if (!press || e.pointerId !== press.pointerId) return;
    const dragged = Boolean(ghost);
    const source = { kind: press.kind, id: press.id };
    const target = over;
    end();
    if (!dragged) return;
    suppressNextClick();
    if (target) onDrop(source, target);
  });

  document.addEventListener('pointercancel', end);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ghost) {
      suppressNextClick();
      end();
    }
  });
}
