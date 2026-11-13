import { Screen, unavailable } from '../core/Screen';
import { h, cx, svgEl, type Child } from '../core/dom';
import { btn, emptyState, frame } from '../core/components';
import { icon, REGION_ICON } from '../core/icons';
import { regionName, run, REGIONS } from '../core/util';
import type { MapRegion, MapSnapshot, RegionId } from '../contracts';

export class WorldMapScreen extends Screen {
  readonly id = 'map' as const;
  private map: MapSnapshot | null = null;
  private selected: RegionId | null = null;

  protected override async load(): Promise<void> {
    const w = this.ctx.backend.world;
    this.map = w ? await w.getMap() : null;
    if (!this.selected) this.selected = this.map?.current ?? null;
  }

  protected override label(): string { return this.ctx.t('tab.map'); }

  protected render(): Child {
    const { ctx } = this;
    if (!ctx.backend.world || !this.map) return frame(ctx, { title: ctx.t('tab.map'), tab: 'map' }, unavailable(ctx));
    const m = this.map;
    const regions = [...m.regions].sort((a, b) => REGIONS.indexOf(a.id) - REGIONS.indexOf(b.id));
    const sel = regions.find((r) => r.id === this.selected) ?? null;

    return frame(ctx, { title: ctx.t('tab.map'), tab: 'map' },
      h('div', { class: 'split split--map' },
        h('section', { class: 'split__list' },
          h('div', { class: 'parchment', 'data-scroll': 'parchment' },
            svgEl('svg', { class: 'parchment__path', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
              this.pathEl(regions)),
            regions.map((r) => this.pin(r, m.current === r.id)))),
        h('aside', { class: 'split__detail panel panel--inset', 'data-scroll': 'detail' },
          sel ? this.detail(sel, m.current === sel.id) : emptyState(ctx.t('map.select'), 'map'))));
  }

  /** Draw authored branches and loops in the region graph. */
  private pathEl(regions: MapRegion[]): SVGElement {
    const g=svgEl('g'),byId=new Map(regions.map(r=>[r.id,r])),drawn=new Set<string>();
    for(const a of regions)for(const id of a.connections??[]){const b=byId.get(id);if(!b)continue;const key=[a.id,b.id].sort().join('|');if(drawn.has(key))continue;drawn.add(key);
      g.appendChild(svgEl('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:cx('road',(a.state==='locked'||b.state==='locked')&&'is-locked'),'vector-effect':'non-scaling-stroke'}));
    }
    return g;
  }

  private pin(r: MapRegion, here: boolean): Child {
    const { ctx } = this;
    const name = r.state === 'locked' ? '???' : r.name ? ctx.resolve(r.name) : regionName(ctx, r.id);
    return h('button', {
      type: 'button', class: cx('pin', `pin--${r.state}`, r.id === this.selected && 'is-selected', here && 'is-here', r.x < 20 && 'pin--edge-l', r.x > 80 && 'pin--edge-r'),
      // Map coordinates are physical (not logical): the parchment itself is always LTR so geography never mirrors.
      style: `left:${r.x}%;top:${r.y}%`, 'aria-label': `${name} — ${ctx.t(`map.state.${r.state}` as 'map.state.locked')}`,
      'data-focus': `pin-${r.id}`,
      onclick: () => { this.selected = r.id; ctx.sfx('click'); this.rerender(); },
    },
      h('span', { class: 'pin__disc' }, icon(r.state === 'locked' ? 'lock' : REGION_ICON[r.id] ?? 'map')),
      here ? h('span', { class: 'pin__here', 'aria-hidden': 'true' }) : null,
      h('span', { class: 'pin__label' }, name));
  }

  private detail(r: MapRegion, here: boolean): Child {
    const { ctx } = this;
    const locked = r.state === 'locked';
    const name = locked ? '???' : r.name ? ctx.resolve(r.name) : regionName(ctx, r.id);
    const w = ctx.backend.world!;
    const canTravel = !!w.fastTravel && !locked && !here;
    return h('div', { class: 'detail' },
      h('div', { class: 'detail-head' },
        h('div', { class: 'slot has-item detail-head__art' }, h('span', { class: 'slot__art' }, icon(locked ? 'lock' : REGION_ICON[r.id]))),
        h('div', { class: 'detail-head__text' },
          h('h3', { class: 'detail-head__name' }, name),
          h('div', { class: 'chips' },
            h('span', { class: cx('chip', `chip--${r.state}`) }, ctx.t(`map.state.${r.state}` as 'map.state.locked')),
            here ? h('span', { class: 'chip chip--gold' }, icon('flame'), ctx.t('map.here')) : null))),
      !locked ? h('p', { class: 'detail__desc story-text' },
        r.description ? ctx.resolve(r.description) : ctx.t(`region.desc.${r.id}` as 'region.desc.crownfall')) : null,
      r.levelRange && !locked ? h('p', { class: 'small muted' }, ctx.t('map.levels', { a: r.levelRange[0], b: r.levelRange[1] })) : null,
      canTravel ? h('div', { class: 'detail__actions' },
        btn({
          label: ctx.t('map.travel'), icon: 'arrowRight', flipIcon: true, variant: 'primary',
          sub: r.fastTravelCost ? `${ctx.num(r.fastTravelCost)} ${ctx.t('common.gold')}` : undefined,
          onClick: () => void this.travel(r),
        })) : null);
  }

  private async travel(r: MapRegion): Promise<void> {
    const { ctx } = this;
    const ok = await ctx.confirm({
      title: ctx.t('map.travelTitle', { region: regionName(ctx, r.id) }), body: ctx.t('map.travelBody'), icon: 'map', confirmLabel: ctx.t('map.travel'),
    });
    if (!ok) return;
    if (await run(ctx, ctx.backend.world!.fastTravel!(r.id))) {
      ctx.sfx('confirm');
      await this.refresh();
    }
  }
}
