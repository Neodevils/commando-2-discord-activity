type Direction = 'up' | 'down' | 'left' | 'right';

type KeySpec = {
  key: string;
  code: string;
  keyCode: number;
};

// Commando 2's default bindings: arrows (or WASD) move/jump/crouch, Q/E switch weapons.
const MOVE_KEYS: Record<Direction, KeySpec> = {
  up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
};

const WEAPON_KEYS = {
  previous: { key: 'q', code: 'KeyQ', keyCode: 81 },
  next: { key: 'e', code: 'KeyE', keyCode: 69 },
} satisfies Record<string, KeySpec>;

const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];
const ARROW_GLYPHS: Record<Direction, string> = {
  up: '\u25B2',
  down: '\u25BC',
  left: '\u25C0',
  right: '\u25B6',
};
const DEADZONE = 0.35;

export function shouldShowTouchControls(): boolean {
  if (new URLSearchParams(window.location.search).has('touch')) return true;
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

/**
 * Overlays a thumb D-pad and weapon buttons on touch devices. The game itself
 * still receives taps on the uncovered area, which Ruffle turns into mouse aim
 * and fire, so the player can hold the pad with one thumb and shoot with the
 * other.
 */
export function mountTouchControls(player: RufflePlayerElement): void {
  if (!shouldShowTouchControls() || document.querySelector('.touch-controls')) return;

  const root = document.createElement('div');
  root.className = 'touch-controls';

  const stick = document.createElement('div');
  stick.className = 'touch-stick';
  stick.setAttribute('role', 'group');
  stick.setAttribute('aria-label', 'Movement pad');

  const base = document.createElement('div');
  base.className = 'touch-stick__base';

  const knob = document.createElement('div');
  knob.className = 'touch-stick__knob';
  knob.setAttribute('aria-hidden', 'true');

  const arrows = {} as Record<Direction, HTMLSpanElement>;
  for (const direction of DIRECTIONS) {
    const arrow = document.createElement('span');
    arrow.className = `touch-stick__arrow touch-stick__arrow--${direction}`;
    arrow.textContent = ARROW_GLYPHS[direction];
    arrow.setAttribute('aria-hidden', 'true');
    arrows[direction] = arrow;
    stick.appendChild(arrow);
  }

  stick.append(base, knob);

  const actions = document.createElement('div');
  actions.className = 'touch-actions';

  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'touch-action';
  previous.textContent = 'Q';
  previous.setAttribute('aria-label', 'Previous weapon');

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'touch-action';
  next.textContent = 'E';
  next.setAttribute('aria-label', 'Next weapon');

  actions.append(previous, next);

  const hint = document.createElement('p');
  hint.className = 'touch-hint';
  hint.textContent = 'Tap the game to aim & shoot';

  root.append(stick, actions, hint);
  document.querySelector('#app')?.appendChild(root);
  document.body.classList.add('has-touch-controls');

  const held = new Map<string, KeySpec>();
  const active = new Set<Direction>();

  function focusPlayer(): void {
    player.focus({ preventScroll: true });
  }

  function sendKey(type: 'keydown' | 'keyup', spec: KeySpec): void {
    if (type === 'keydown') held.set(spec.code, spec);
    else held.delete(spec.code);

    focusPlayer();
    // Ruffle reads keyboard events on the player once it holds focus.
    player.dispatchEvent(
      new KeyboardEvent(type, {
        key: spec.key,
        code: spec.code,
        keyCode: spec.keyCode,
        which: spec.keyCode,
        bubbles: true,
        cancelable: true,
        composed: true,
      } as KeyboardEventInit),
    );
  }

  function setDirections(nextDirections: Set<Direction>): void {
    const added = [...nextDirections].filter((direction) => !active.has(direction));
    const removed = [...active].filter((direction) => !nextDirections.has(direction));

    for (const direction of removed) sendKey('keyup', MOVE_KEYS[direction]);
    for (const direction of added) sendKey('keydown', MOVE_KEYS[direction]);

    active.clear();
    for (const direction of nextDirections) active.add(direction);

    for (const direction of DIRECTIONS) {
      arrows[direction].classList.toggle('is-active', nextDirections.has(direction));
    }
  }

  function resetKnob(): void {
    knob.style.transform = 'translate(-50%, -50%)';
  }

  let stickPointer: number | null = null;

  function updateFromPointer(event: PointerEvent): void {
    const rect = stick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const travel = rect.width * 0.3;

    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    if (distance > travel && distance > 0) {
      dx = (dx / distance) * travel;
      dy = (dy / distance) * travel;
    }

    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    const nx = dx / travel;
    const ny = dy / travel;
    const nextDirections = new Set<Direction>();
    if (nx < -DEADZONE) nextDirections.add('left');
    if (nx > DEADZONE) nextDirections.add('right');
    if (ny < -DEADZONE) nextDirections.add('up');
    if (ny > DEADZONE) nextDirections.add('down');

    setDirections(nextDirections);
  }

  stick.addEventListener('pointerdown', (event) => {
    if (stickPointer !== null) return;
    event.preventDefault();
    event.stopPropagation();

    stickPointer = event.pointerId;
    try {
      stick.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers cannot be captured; real touches can.
    }
    updateFromPointer(event);
  });

  stick.addEventListener('pointermove', (event) => {
    if (event.pointerId !== stickPointer) return;
    event.preventDefault();
    updateFromPointer(event);
  });

  function releaseStick(event?: PointerEvent): void {
    if (stickPointer === null) return;
    if (event && event.pointerId !== stickPointer) return;

    stickPointer = null;
    setDirections(new Set());
    resetKnob();
  }

  stick.addEventListener('pointerup', releaseStick);
  stick.addEventListener('pointercancel', releaseStick);
  stick.addEventListener('lostpointercapture', releaseStick);

  const weaponButtons = [
    { button: previous, spec: WEAPON_KEYS.previous, pointerId: null as number | null },
    { button: next, spec: WEAPON_KEYS.next, pointerId: null as number | null },
  ];

  for (const entry of weaponButtons) {
    entry.button.addEventListener('pointerdown', (event) => {
      if (entry.pointerId !== null) return;
      event.preventDefault();
      event.stopPropagation();

      entry.pointerId = event.pointerId;
      try {
        entry.button.setPointerCapture(event.pointerId);
      } catch {
        // Ignore synthetic pointers.
      }
      entry.button.classList.add('is-pressed');
      sendKey('keydown', entry.spec);
    });

    const release = (event: PointerEvent) => {
      if (entry.pointerId === null || event.pointerId !== entry.pointerId) return;
      entry.pointerId = null;
      entry.button.classList.remove('is-pressed');
      sendKey('keyup', entry.spec);
    };

    entry.button.addEventListener('pointerup', release);
    entry.button.addEventListener('pointercancel', release);
    entry.button.addEventListener('lostpointercapture', release);
  }

  function releaseAll(): void {
    stickPointer = null;
    resetKnob();
    setDirections(new Set());
    for (const spec of [...held.values()]) sendKey('keyup', spec);
    for (const entry of weaponButtons) {
      entry.pointerId = null;
      entry.button.classList.remove('is-pressed');
    }
  }

  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
  });

  window.setTimeout(() => hint.classList.add('is-fading'), 9000);
}
