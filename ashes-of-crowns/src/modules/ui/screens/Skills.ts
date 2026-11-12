import { Screen, unavailable } from '../core/Screen';
import { h, cx, svgEl, type Child } from '../core/dom';
import { btn, detailHeader, emptyState, frame, sectionTitle } from '../core/components';
import { glyph, icon } from '../core/icons';
import { run } from '../core/util';
import { HUD_SKILL_SLOTS, type SkillNode, type SkillTree } from '../contracts';

const SVG_NS = 'http://www.w3.org/2000/svg';

export class SkillsScreen extends Screen {
  readonly id = 'skills' as const;
  private trees: SkillTree[] = [];
  private points = 0;
  private hotbar: (string | null)[] = [];
  private treeId: string | null = null;
  private selectedId: string | null = null;
  private resizeObs: ResizeObserver | null = null;

  protected override onOpen(): void { this.selectedId = null; }

  protected override async load(): Promise<void> {
    const s = this.ctx.backend.skills;
    if (!s) { this.trees = []; return; }
    this.trees = await s.getSkillTrees();
    this.points = await s.getSkillPoints();
    this.hotbar = s.getHotbar ? await s.getHotbar() : [];
    if (!this.trees.some((t) => t.id === this.treeId)) this.treeId = this.trees[0]?.id ?? null;
  }

  override onClose(): void { this.resizeObs?.disconnect(); this.resizeObs = null; }
  protected override label(): string { return this.ctx.t('tab.skills'); }

  private get tree(): SkillTree | undefined { return this.trees.find((t) => t.id === this.treeId); }

  protected render(): Child {
    const { ctx } = this;
    if (!ctx.backend.skills) return frame(ctx, { title: ctx.t('tab.skills'), tab: 'skills' }, unavailable(ctx));
    const tree = this.tree;
    const pointsChip = h('div', { class: 'chip chip--points' }, icon('star'), `${ctx.t('skill.points')}: `, h('b', null, ctx.num(this.points)));

    if (!tree) return frame(ctx, { title: ctx.t('tab.skills'), tab: 'skills', actions: pointsChip }, emptyState(ctx.t('common.empty'), 'wand'));

    const maxTier = Math.max(1, ...tree.nodes.map((n) => n.tier));
    const maxRow = Math.max(0, ...tree.nodes.map((n) => n.row));
    const sel = tree.nodes.find((n) => n.id === this.selectedId) ?? null;

    const grid = h('div', {
      class: 'tree__grid',
      style: `grid-template-columns:repeat(${maxTier},var(--node-cell));grid-template-rows:repeat(${maxRow + 1},var(--node-cell))`,
    }, tree.nodes.map((n) => this.node(n)));

    return frame(ctx, { title: ctx.t('tab.skills'), tab: 'skills', actions: pointsChip },
      h('div', { class: 'split split--skills' },
        h('section', { class: 'split__list' },
          this.trees.length > 1 ? h('div', { class: 'filters', role: 'tablist', 'data-scroll': 'treetabs' },
            this.trees.map((t) => h('button', {
              type: 'button', role: 'tab', class: cx('filter', t.id === this.treeId && 'is-on'), 'aria-selected': String(t.id === this.treeId),
              onclick: () => { this.treeId = t.id; this.selectedId = null; this.rerender(); },
            }, icon(t.icon && !/[./]/.test(t.icon) ? t.icon : 'wand'), h('span', { class: 'filter__label' }, ctx.resolve(t.name))))) : null,
          h('div', { class: 'tree split__scroll', 'data-scroll': 'tree' },
            h('div', { class: 'tree__inner' },
              svgEl('svg', { class: 'tree__links', 'aria-hidden': 'true' }), grid))),
        h('aside', { class: 'split__detail panel panel--inset', 'data-scroll': 'detail' },
          sel ? this.detail(sel) : emptyState(ctx.t('skill.select'), 'wand'))));
  }

  private node(n: SkillNode): Child {
    const { ctx } = this;
    const state = n.rank >= n.maxRank ? 'max' : n.rank > 0 ? 'learned' : n.available ? 'available' : 'locked';
    return h('button', {
      type: 'button', class: cx('node', `node--${state}`, n.active && 'node--active', n.id === this.selectedId && 'is-selected'),
      style: `grid-column:${n.tier};grid-row:${n.row + 1}`, dataset: { node: n.id },
      'aria-label': ctx.resolve(n.name), 'aria-pressed': String(n.id === this.selectedId), 'data-focus': `node-${n.id}`,
      onclick: () => { this.selectedId = n.id; ctx.sfx('click'); this.rerender(); },
    },
      h('span', { class: 'node__art' }, glyph(n.icon, 'wand')),
      h('span', { class: 'node__rank' }, state === 'locked' ? icon('lock') : `${ctx.num(n.rank)}/${ctx.num(n.maxRank)}`));
  }

  private detail(n: SkillNode): Child {
    const { ctx } = this;
    const sk = ctx.backend.skills!;
    const byId = new Map(this.tree!.nodes.map((x) => [x.id, x]));
    const maxed = n.rank >= n.maxRank;
    const enoughPoints = this.points >= n.cost;
    const canBuy = !maxed && n.available && enoughPoints && !!sk.unlockSkill;
    const reason = maxed ? ctx.t('skill.maxed') : !n.available ? ctx.t('skill.prereq') : !enoughPoints ? ctx.t('skill.noPoints') : '';
    const slotsN = Math.max(HUD_SKILL_SLOTS, this.hotbar.length);
    const onBar = this.hotbar.indexOf(n.id);

    return h('div', { class: 'detail' },
      detailHeader(ctx, { name: ctx.resolve(n.name), icon: n.icon, rarity: maxed ? 'legendary' : n.rank > 0 ? 'rare' : 'common' }),
      h('div', { class: 'chips' },
        h('span', { class: 'chip' }, ctx.t(n.active ? 'skill.active' : 'skill.passive')),
        h('span', { class: 'chip' }, ctx.t('skill.rank', { a: n.rank, b: n.maxRank })),
        n.manaCost ? h('span', { class: 'chip' }, icon('mana'), ctx.t('skill.mana', { n: n.manaCost })) : null,
        n.cooldownSec ? h('span', { class: 'chip' }, icon('speed'), ctx.t('skill.cooldown', { n: n.cooldownSec })) : null),
      n.description ? h('p', { class: 'detail__desc' }, ctx.resolve(n.description)) : null,
      n.requires?.length ? h('div', null, sectionTitle(ctx.t('skill.requires')),
        h('ul', { class: 'req-list' }, n.requires.map((id) => {
          const r = byId.get(id);
          const met = !!r && r.rank > 0;
          return h('li', { class: met ? 'is-met' : 'is-unmet' }, icon(met ? 'check' : 'lock'), r ? ctx.resolve(r.name) : id);
        }))) : null,
      h('div', { class: 'detail__actions' },
        !maxed && sk.unlockSkill ? btn({
          label: ctx.t(n.rank > 0 ? 'skill.upgrade' : 'skill.unlock'), sub: ctx.t('skill.cost', { n: n.cost }), icon: 'star', variant: 'primary', disabled: !canBuy,
          onClick: () => void this.unlock(n),
        }) : null),
      reason && !canBuy ? h('p', { class: 'small muted' }, reason) : null,
      n.active && n.rank > 0 && sk.setHotbar ? h('div', null,
        sectionTitle(ctx.t('skill.hotbar'), 'fist'),
        h('div', { class: 'hotbar-pick' }, Array.from({ length: slotsN }, (_, i) => btn({
          label: ctx.t('skill.slotN', { n: i + 1 }), variant: onBar === i ? 'primary' : 'secondary',
          onClick: () => void this.assign(i, n.id),
        }))),
        onBar >= 0 ? btn({ label: ctx.t('skill.unassign'), icon: 'close', variant: 'ghost', onClick: () => void this.assign(onBar, null) }) : null) : null);
  }

  private async unlock(n: SkillNode): Promise<void> {
    const { ctx } = this;
    if (await run(ctx, ctx.backend.skills!.unlockSkill!(n.id))) {
      ctx.sfx('confirm');
      ctx.toast({ text: ctx.t('skill.learned', { name: ctx.resolve(n.name) }), kind: 'success', icon: 'star' });
      await this.refresh();
    }
  }

  private async assign(index: number, id: string | null): Promise<void> {
    const { ctx } = this;
    if (await run(ctx, ctx.backend.skills!.setHotbar!(index, id))) {
      ctx.sfx('equip');
      await this.refresh();
    }
  }

  /** Draw prerequisite connectors once the grid has been laid out. */
  protected override afterRender(): void {
    const inner = this.el.querySelector<HTMLElement>('.tree__inner');
    const svg = this.el.querySelector<SVGSVGElement>('.tree__links');
    const tree = this.tree;
    if (!inner || !svg || !tree) return;
    this.resizeObs?.disconnect();
    const draw = () => {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const box = inner.getBoundingClientRect();
      svg.setAttribute('width', String(box.width));
      svg.setAttribute('height', String(box.height));
      const els = new Map<string, DOMRect>();
      inner.querySelectorAll<HTMLElement>('[data-node]').forEach((e) => els.set(e.dataset.node!, e.getBoundingClientRect()));
      const byId = new Map(tree.nodes.map((n) => [n.id, n]));
      for (const n of tree.nodes) {
        for (const rid of n.requires ?? []) {
          const a = els.get(rid), b = els.get(n.id);
          if (!a || !b) continue;
          const from = byId.get(rid)!;
          const ax = a.left + a.width / 2 - box.left, ay = a.top + a.height / 2 - box.top;
          const bx = b.left + b.width / 2 - box.left, by = b.top + b.height / 2 - box.top;
          const my = (ax + bx) / 2;
          const p = document.createElementNS(SVG_NS, 'path');
          p.setAttribute('d', `M${ax},${ay} C${my},${ay} ${my},${by} ${bx},${by}`);
          p.setAttribute('class', cx('link', from.rank > 0 && 'is-on'));
          svg.appendChild(p);
        }
      }
    };
    requestAnimationFrame(draw);
    if (typeof ResizeObserver !== 'undefined') { this.resizeObs = new ResizeObserver(draw); this.resizeObs.observe(inner); }
  }
}
