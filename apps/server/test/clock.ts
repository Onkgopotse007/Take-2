import type { Scheduler } from '../src/table';

/** A clock that only moves when told to, firing due timers in order. */
export class FakeClock implements Scheduler {
  private t = 1_000_000;
  private timers: { at: number; cb: () => void; cleared: boolean }[] = [];
  now() {
    return this.t;
  }
  setTimeout(cb: () => void, ms: number) {
    const timer = { at: this.t + ms, cb, cleared: false };
    this.timers.push(timer);
    return { clear: () => void (timer.cleared = true) };
  }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const due = this.timers.filter((x) => !x.cleared && x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      due.cleared = true;
      this.t = due.at;
      due.cb();
    }
    this.t = end;
  }
}
