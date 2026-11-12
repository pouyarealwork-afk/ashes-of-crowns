import type { Runtime } from '../core/Runtime';
import type { StoryEventDef } from '../types';

/** Fires cutscene/story dialogues from zone triggers or state conditions; queues while a dialogue is active. */
export class StoryDirector {
  private queue: StoryEventDef[] = [];
  constructor(private rt: Runtime) {}

  private fire(e: StoryEventDef): void {
    if (e.once !== false) this.rt.state.fired.add(e.id);
    this.queue.push(e);
    this.flush();
  }
  private eligible(e: StoryEventDef): boolean {
    return !(e.once !== false && this.rt.state.fired.has(e.id)) && !this.queue.includes(e) && this.rt.check(e.when);
  }
  onZone(zoneId: string): void {
    for (const e of this.rt.content.storyEvents) if (e.zone === zoneId && this.eligible(e)) this.fire(e);
  }
  /** Called from Runtime.refresh(): fires `auto` events. */
  refresh(): boolean {
    let changed = false;
    for (const e of this.rt.content.storyEvents) {
      if (e.auto && this.eligible(e) && this.rt.check(e.auto)) { this.fire(e); changed = true; }
    }
    return changed;
  }
  flush(): void {
    if (this.rt.dialogue.isActive()) return;
    const e = this.queue.shift();
    if (e) { this.rt.bus.emit('world:story-event', { id: e.id, dialogue: e.dialogue }); this.rt.dialogue.start(e.dialogue); }
  }
  pending(): number { return this.queue.length; }
}
