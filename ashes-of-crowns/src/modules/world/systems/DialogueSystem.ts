import type { Runtime } from '../core/Runtime';
import type { DialogueChoice, DialogueNode, DialogueTree, DialogueView } from '../types';

export class DialogueSystem {
  private tree?: DialogueTree;
  private nodeId?: string;
  private reactions: DialogueView['reactions'] = [];
  private lastView?: DialogueView;
  constructor(private rt: Runtime) {}

  isActive(): boolean { return !!this.tree; }
  getCurrent(): DialogueView | null { return this.lastView ?? null; }

  /** Start the first conditionally-valid dialogue tree for an NPC. */
  startNpc(npcId: string): DialogueView | null {
    const npc = this.rt.content.npcs.get(npcId);
    if (!npc) return null;
    for (const e of npc.dialogue) if (this.rt.check(e.when)) return this.start(e.tree);
    return null;
  }

  start(treeId: string): DialogueView | null {
    const tree = this.rt.content.dialogues.get(treeId);
    if (!tree) return null;
    if (this.tree) this.finish();
    this.tree = tree; this.reactions = [];
    let node = tree.start;
    for (const e of tree.entries ?? []) if (this.rt.check(e.when)) { node = e.node; break; }
    this.rt.bus.emit('world:dialogue-started', { treeId, npc: tree.npc, kind: tree.kind ?? 'talk' });
    this.enter(node);
    return this.lastView ?? null;
  }

  private enter(id: string): void {
    const node = this.tree?.nodes[id];
    if (!node) { this.finish(); return; }
    this.nodeId = id;
    this.rt.apply(node.effects);
    this.lastView = this.buildView(node);
    this.reactions = [];
    this.rt.bus.emit('world:dialogue-node', this.lastView);
  }

  private visibleChoices(node: DialogueNode): DialogueChoice[] {
    return (node.choices ?? []).filter(c => this.rt.check(c.when));
  }

  private buildView(node: DialogueNode): DialogueView {
    let text = node.text;
    for (const v of node.variants ?? []) if (this.rt.check(v.when)) { text = v.text; break; }
    const choices = this.visibleChoices(node).map((c, index) => ({ index, text: c.text, tags: c.tags }));
    const npc = this.rt.content.npcs.get(node.speaker);
    const name = node.speaker === 'aren' ? 'Aren' : node.speaker === 'narrator' ? '' : npc?.name ?? this.rt.content.companions.get(node.speaker)?.name ?? node.speaker;
    return {
      treeId: this.tree!.id, nodeId: this.nodeId!, speaker: node.speaker, speakerName: name, text, mood: node.mood,
      choices, canAdvance: choices.length === 0, ended: false, reactions: this.reactions,
    };
  }

  choose(index: number): DialogueView | null {
    if (!this.tree || !this.nodeId) return null;
    const node = this.tree.nodes[this.nodeId];
    const c = this.visibleChoices(node)[index];
    if (!c) return this.lastView ?? null;
    if (c.tags?.length) this.reactions = this.rt.companions.react(c.tags);
    this.rt.apply(c.effects);
    if (c.next) this.enter(c.next); else this.finish();
    return this.lastView ?? null;
  }

  advance(): DialogueView | null {
    if (!this.tree || !this.nodeId) return null;
    const node = this.tree.nodes[this.nodeId];
    if (this.visibleChoices(node).length) return this.lastView ?? null; // must choose
    if (node.next) this.enter(node.next); else this.finish();
    return this.lastView ?? null;
  }

  end(): void { if (this.tree) this.finish(); }

  private finish(): void {
    const tree = this.tree; if (!tree) return;
    this.tree = undefined; this.nodeId = undefined;
    const ended: DialogueView = { ...(this.lastView as DialogueView), ended: true, choices: [], canAdvance: false };
    this.lastView = undefined;
    if (tree.npc) { this.rt.bump(`talk:${tree.npc}`); this.rt.setFlag(`talked_${tree.npc}`); }
    this.rt.bump(`dlg:${tree.id}`);
    this.rt.apply(tree.onEnd);
    this.rt.bus.emit('world:dialogue-ended', { treeId: tree.id, npc: tree.npc, last: ended });
    this.rt.story.flush();
    this.rt.refresh();
  }
}
