import { Screen } from '../core/Screen';
import { h, cx, type Child } from '../core/dom';
import { btn, } from '../core/components';
import { glyph, icon } from '../core/icons';
import type { DialogueChoice, DialogueNode, DialogueTree } from '../contracts';

export interface DialogueParams { tree: DialogueTree }

/**
 * Visual-novel style dialogue box: typewriter text, tap to finish/advance, choices.
 * State (current node, typed progress, chosen path) lives on the instance, so
 * language switches re-render the same line without restarting it.
 */
export class DialogueScreen extends Screen<DialogueParams> {
  readonly id = 'dialogue' as const;
  override readonly dismissable = false;
  protected override needsData = false;

  private nodeId = '';
  private path: string[] = [];
  private typed = 0;
  /** Explicit flag (not derived from lengths): the line may change length when the language switches. */
  private complete = false;
  private timer: number | null = null;
  private finished = false;
  private cancelled = false;

  protected override onOpen(): void {
    const t = this.params.tree;
    this.path = [];
    this.finished = false;
    this.cancelled = false;
    this.goto(t.start, false);
  }

  override onClose(): void { this.stopTyping(); }
  protected override label(): string { return this.node ? this.ctx.resolve(this.node.speaker) : ''; }

  private get node(): DialogueNode | undefined { return this.params?.tree.nodes[this.nodeId]; }
  private fullText(): string { return this.node ? this.ctx.resolve(this.node.text) : ''; }
  private get typing(): boolean { return !this.complete; }

  private goto(id: string | undefined, rerender = true): void {
    this.stopTyping();
    if (!id || !this.params.tree.nodes[id]) { this.end(); return; }
    this.nodeId = id;
    this.typed = 0;
    this.complete = false;
    if (this.ctx.settings.reduceMotion) { this.complete = true; }
    else this.startTyping();
    if (rerender) this.rerender();
  }

  private startTyping(): void {
    this.timer = window.setInterval(() => {
      // Re-read the text every tick so a language switch mid-line keeps typing the *new* line.
      const total = [...this.fullText()].length;
      this.typed = Math.min(total, this.typed + 1);
      this.updateText();
      if (this.typed >= total) { this.complete = true; this.stopTyping(); this.rerender(); }
    }, 24);
  }
  private stopTyping(): void { if (this.timer !== null) { clearInterval(this.timer); this.timer = null; } }

  /**
   * Update only the text node while typing. Persian must never be revealed letter-by-letter
   * through DOM splitting (that would break joining), so we reveal by prefix of the whole string.
   */
  private updateText(): void {
    const el = this.el.querySelector('.dlg__text');
    if (el) el.textContent = [...this.fullText()].slice(0, this.typed).join('');
  }

  private advance(): void {
    const n = this.node;
    if (!n) return;
    if (this.typing) { this.stopTyping(); this.complete = true; this.rerender(); return; }
    if (n.choices?.length) return; // must pick a choice
    this.goto(n.next);
  }

  private choose(c: DialogueChoice): void {
    const n = this.node!;
    this.path.push(c.id);
    this.ctx.sfx('click');
    this.ctx.events.emit('dialogue:choice', { dialogueId: this.params.tree.id, nodeId: n.id, choiceId: c.id, meta: c.meta });
    this.goto(c.next);
  }

  private end(): void {
    if (this.finished) return;
    this.finished = true;
    this.stopTyping();
    const id = this.params.tree.id;
    if (this.cancelled) this.ctx.events.emit('dialogue:cancel', { dialogueId: id });
    this.ctx.events.emit('dialogue:end', { dialogueId: id, choices: [...this.path] });
    this.ctx.back();
  }

  private cancelDialogue(): void {
    if (this.finished) return;
    this.cancelled = true;
    this.end();
  }

  override handleBack(): boolean {
    // Back always offers a reliable way out, including while a choice is on screen.
    this.cancelDialogue();
    return true;
  }

  protected render(): Child {
    const { ctx } = this;
    const n = this.node;
    if (!n) return h('div');
    const typing = this.typing;
    const shown = typing ? [...this.fullText()].slice(0, this.typed).join('') : this.fullText();
    const choices = !typing && n.choices?.length ? n.choices : null;
    const speaker = ctx.resolve(n.speaker);

    return h('div', { class: 'dlg', onclick: (e: Event) => { if (!(e.target as HTMLElement).closest('button')) this.advance(); } },
      h('div', { class: 'dlg__scrim', 'aria-hidden': 'true' }),
      h('div', { class: 'dlg__stage' },
        n.portrait ? h('div', { class: 'dlg__portrait panel' }, glyph(n.portrait, 'hero')) : null),
      h('div', { class: 'dlg__box panel panel--big' },
        h('button', { class: 'dlg__exit', type: 'button', 'aria-label': ctx.settings.lang === 'fa' ? 'پایان گفتگو' : 'End dialogue', onclick: (e: Event) => { e.stopPropagation(); this.cancelDialogue(); } }, ctx.settings.lang === 'fa' ? 'پایان گفتگو ×' : 'End conversation ×'),
        speaker ? h('div', { class: 'dlg__name' }, icon('crown'), speaker) : null,
        h('p', { class: cx('dlg__text', 'story-text'), 'aria-live': 'polite' }, shown),
        choices
          ? h('div', { class: 'dlg__choices', role: 'group' }, choices.map((c, i) => h('div', { class: 'dlg__choice-wrap' },
            btn({
              label: ctx.text(c.text), variant: 'secondary', block: true, disabled: !!c.disabled, focus: `choice-${i}`,
              onClick: () => this.choose(c),
            }),
            c.disabled && c.hint ? h('div', { class: 'small muted' }, ctx.resolve(c.hint)) : null)))
          : h('div', { class: 'dlg__hint' }, typing ? null : icon(n.next || n.choices ? 'next' : 'check', 'flip-rtl pulse'),
            typing ? null : h('span', null, ctx.t('dlg.continue')))));
  }
}
