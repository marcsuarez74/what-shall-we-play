// Machine à état de l'appui maintenu (long press) — pure et testée unitairement.
//
// Pourquoi pas juste un setTimeout dans le composant ? Parce que les navigateurs
// tactiles maltraitent les pressions longues :
//  - vieux WebKit ne déclenche pas du tout les pointer events → il faut aussi
//    écouter touchstart/touchend (d'où un `down()` idempotent) ;
//  - WebKit peut promouvoir le toucher en geste natif et envoyer `pointercancel`
//    alors que le doigt tenait immobile → `cancelAsPress()` considère qu'un
//    maintien ≥ LONG_PRESS_MS - GRACE est un long press raté de justesse ;
//  - un vrai glisser (scroll) doit annuler — au-delà de MOVE_SLOP_PX.
export const LONG_PRESS_MS = 400;
export const MOVE_SLOP_PX = 10;
// Marge de grâce : pointercancel arrivant juste avant l'échéance reste un long press.
const GRACE_MS = 100;

export class LongPress {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private origin: { x: number; y: number; t: number } | null = null;
  private _fired = false;

  constructor(private readonly fire: () => void, private readonly ms: number = LONG_PRESS_MS) {}

  get active(): boolean {
    return this.origin !== null;
  }

  // Idempotent : pointerdown puis touchstart (même toucher, deux APIs) ne créent qu'un timer.
  down(x: number, y: number, now: number = Date.now()): void {
    if (this.active) return;
    this.origin = { x, y, t: now };
    this.timer = setTimeout(() => {
      this.timer = null;
      this.origin = null;
      this._fired = true;
      this.fire();
    }, this.ms);
  }

  move(x: number, y: number): void {
    if (!this.origin) return;
    if (Math.hypot(x - this.origin.x, y - this.origin.y) > MOVE_SLOP_PX) this.cancel();
  }

  up(): void {
    this.cancel();
  }

  // `pointercancel`/`touchcancel` du navigateur : si le doigt tenait assez longtemps,
  // c'est un long press que le navigateur nous a volé — on déclenche quand même.
  cancelAsPress(now: number = Date.now()): boolean {
    const held = this.origin ? now - this.origin.t : 0;
    const wasRunning = this.timer !== null;
    this.cancel();
    if (wasRunning && held >= this.ms - GRACE_MS) {
      this._fired = true;
      this.fire();
      return true;
    }
    return false;
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.origin = null;
  }
}
