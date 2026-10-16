// Instruments keep their simulation in a plain class: it is mutated only from rAF,
// handlers and effects, and publishes the little that render needs as an immutable
// snapshot for useSyncExternalStore.

export class Sim<S> {
  private listeners = new Set<() => void>();
  private snap: S;

  constructor(initial: S) {
    this.snap = initial;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snap;

  protected get view() {
    return this.snap;
  }

  protected publish(patch: Partial<S>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }
}
