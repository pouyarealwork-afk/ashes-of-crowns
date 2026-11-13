import type { LevelDef, RegionId } from '../modules/world/types';
export interface OverworldSegment { region: RegionId; levelId: string; offsetX: number; offsetY: number; width: number; height: number }
export type OverworldExitSource = { levelId: string; exitId: string; route?: false } | { route: true; from: RegionId; to: RegionId } | { teleport: true; spawnName: string };
export interface OverworldRuntime { level: LevelDef; npcs: any[]; collectibles: any[]; hiddenPaths: any[]; segments: OverworldSegment[]; exitSources: Record<string, OverworldExitSource> }

export function buildOverworld(world: any): OverworldRuntime {
  const layout: Record<RegionId, { x: number; y: number }> = {
    ashen_village: { x: 0, y: 5200 }, whispering_forest: { x: 8200, y: 3100 },
    forgotten_desert: { x: 16400, y: 5200 }, frozen_highlands: { x: 8200, y: 500 },
    hollow_city: { x: 16400, y: 7900 }, crownfall: { x: 24600, y: 3100 },
  };
  const ids = (world.getRegionIds() as RegionId[]).sort((a,b) => world.content.regions.get(a).chapter - world.content.regions.get(b).chapter);
  const sources = ids.map(region => {
    const def = world.content.regions.get(region);
    if (!def) throw new Error(`Missing region definition: ${region}`);
    const runtime = world.getLevelRuntime(def.entryLevel);
    if (!runtime) throw new Error(`Missing campaign entry level: ${def.entryLevel}`);
    const candidates = runtime.level.platforms.filter((p: any[]) => p[2] >= 700 && p[1] > runtime.level.size.h * .55);
    const counts = new Map<number,number>(); for (const p of candidates) counts.set(p[1],(counts.get(p[1])??0)+1);
    const floorY = [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] ?? runtime.level.size.h-140;
    return { region, def, runtime, floorY };
  });
  const segments: OverworldSegment[] = sources.map(s => ({ region:s.region, levelId:s.def.entryLevel, offsetX:layout[s.region].x, offsetY:layout[s.region].y, width:s.runtime.level.size.w, height:s.runtime.level.size.h }));
  const first=sources[0].runtime.level as LevelDef, firstSeg=segments[0];
  const level: LevelDef = { ...first, id:'aoc_overworld', name:'The Shattered Crownlands', region:sources[0].region,
    size:{w:41600,h:9400}, spawns:{start:{x:firstSeg.offsetX+first.spawns.start.x,y:firstSeg.offsetY+first.spawns.start.y}},
    platforms:[],hazards:[],enemies:[],npcs:[],collectibles:[],hiddenPaths:[],zones:[],interactables:[],exits:[],lore:[] };
  const npcs:any[]=[],collectibles:any[]=[],hiddenPaths:any[]=[];
  const exitSources:Record<string,OverworldExitSource>={};
  const entryIds=new Set(sources.map(s=>s.def.entryLevel));
  const segByRegion=new Map(segments.map(s=>[s.region,s]));
  for(let i=0;i<sources.length;i++){
    const s=sources[i],seg=segments[i],src=s.runtime.level as LevelDef;
    for(const [name,p] of Object.entries(src.spawns)) level.spawns[`${s.region}_${name}`]={x:p.x+seg.offsetX,y:p.y+seg.offsetY};
    level.platforms.push(...src.platforms.map(([x,y,w,h,k])=>[x+seg.offsetX,y+seg.offsetY,w,h,k] as any));
    level.hazards.push(...src.hazards.map(h=>({...h,rect:{...h.rect,x:h.rect.x+seg.offsetX,y:h.rect.y+seg.offsetY}})));
    level.enemies.push(...src.enemies.map(e=>({...e,x:e.x+seg.offsetX,y:e.y+seg.offsetY,region:s.region,patrol:e.patrol?[e.patrol[0]+seg.offsetX,e.patrol[1]+seg.offsetX] as [number,number]:undefined})));
    level.zones.push(...src.zones.map(z=>({...z,rect:{...z.rect,x:z.rect.x+seg.offsetX,y:z.rect.y+seg.offsetY}})));
    level.interactables.push(...src.interactables.map(p=>({...p,x:p.x+seg.offsetX,y:p.y+seg.offsetY})));
    level.lore.push(...src.lore.map(p=>({...p,x:p.x+seg.offsetX,y:p.y+seg.offsetY})));
    level.hiddenPaths.push(...src.hiddenPaths.map(p=>({...p,rect:{...p.rect,x:p.rect.x+seg.offsetX,y:p.rect.y+seg.offsetY}})));
    npcs.push(...s.runtime.npcs.map((p:any)=>({...p,x:p.x+seg.offsetX,y:p.y+seg.offsetY})));
    collectibles.push(...s.runtime.collectibles.map((p:any)=>({...p,x:p.x+seg.offsetX,y:p.y+seg.offsetY})));
    hiddenPaths.push(...s.runtime.hiddenPaths.map((p:any)=>({...p,rect:{...p.rect,x:p.rect.x+seg.offsetX,y:p.rect.y+seg.offsetY}})));
    for(const ex of src.exits){if(entryIds.has(ex.to.level))continue;const id=`${s.region}__${ex.id}`;level.exits.push({...ex,id,rect:{...ex.rect,x:ex.rect.x+seg.offsetX,y:ex.rect.y+seg.offsetY}});exitSources[id]={levelId:src.id,exitId:ex.id};}
  }

  // Add three symmetric shortcuts to the campaign graph. Region unlocks still gate travel.
  const extra:[RegionId,RegionId][]=[['whispering_forest','frozen_highlands'],['forgotten_desert','hollow_city'],['frozen_highlands','crownfall']];
  for(const [a,b] of extra){
    const da=world.content.regions.get(a),db=world.content.regions.get(b);
    if(da&&!da.connections.some((e:any)=>e.to===b))da.connections.push({to:b});
    if(db&&!db.connections.some((e:any)=>e.to===a))db.connections.push({to:a});
  }
  const seen=new Set<string>();
  for(const source of sources)for(const edge of source.def.connections){
    const pair=[source.region,edge.to].sort().join('|');if(seen.has(pair))continue;seen.add(pair);
    const a=sources.find(s=>s.region===source.region)!,b=sources.find(s=>s.region===edge.to)!;
    for(const [from,to] of [[a,b],[b,a]] as const){
      const seg=segByRegion.get(from.region)!;
      const dx=to.def.mapPos.x-from.def.mapPos.x,dy=to.def.mapPos.y-from.def.mapPos.y;
      const x=Math.abs(dx)>=Math.abs(dy)?(dx>=0?seg.width-150:42):Math.round(seg.width*.52);
      const id=`route_${from.region}_${to.region}`;
      const own=from.def.connections.find((v:any)=>v.to===to.region),reverse=to.def.connections.find((v:any)=>v.to===from.region);
      level.exits.push({id,rect:{x:x+seg.offsetX,y:from.floorY-160+seg.offsetY,w:108,h:160},to:{level:to.def.entryLevel,spawn:'start'},requires:own?.requires??reverse?.requires,lockedText:'The passage is sealed. Follow another path and return when the realm is ready.'} as any);
      exitSources[id]={route:true,from:from.region,to:to.region};
    }
  }

  // Two expansion waves: Cinder Deep + Skyreach, then Buried Sea + Outer Ember Rift.
  const expansions=[
    {id:'abyss',region:'hollow_city' as RegionId,visual:'hollow_city_main',x:32800,y:7900,w:3800,h:1500,fromX:4100,title:'The Cinder Deep',spawn:'exp_abyss',back:'return_abyss',returnX:4550,platforms:[[0,1380,900,120,'stone'],[1050,1240,420,28,'metal'],[1640,1080,460,28,'stone'],[2260,1240,440,28,'metal'],[2860,1380,940,120,'stone']],hazards:[{type:'fire',rect:{x:900,y:1360,w:150,h:20},damage:12},{type:'void',rect:{x:1470,y:1370,w:170,h:20},damage:18},{type:'fire',rect:{x:2700,y:1360,w:160,h:20},damage:12}],enemies:[{type:'hollow_shade',x:1880,y:1040,patrol:[1660,2200]}]},
    {id:'skyreach',region:'frozen_highlands' as RegionId,visual:'frozen_highlands_main',x:32800,y:400,w:3900,h:1750,fromX:6500,title:'The Skyreach Crown',spawn:'exp_skyreach',back:'return_skyreach',returnX:6450,platforms:[[0,1640,760,110,'ice'],[900,1460,360,26,'ice'],[1400,1260,360,26,'stone'],[1950,1040,420,26,'ice'],[2500,820,420,26,'stone'],[3050,620,850,110,'ice']],hazards:[],enemies:[]},
    {id:'buried_sea',region:'forgotten_desert' as RegionId,visual:'forgotten_desert_main',x:37000,y:7900,w:4200,h:1500,fromX:6200,title:'The Buried Sea',spawn:'exp_buried_sea',back:'return_buried_sea',returnX:6250,platforms:[[0,1380,850,120,'stone'],[1000,1220,460,28,'stone'],[1620,1050,480,28,'metal'],[2280,1220,460,28,'stone'],[2920,1380,1280,120,'stone']],hazards:[{type:'void',rect:{x:850,y:1360,w:150,h:20},damage:12}],enemies:[]},
    {id:'outer_rift',region:'crownfall' as RegionId,visual:'crownfall_main',x:37000,y:3500,w:4600,h:1550,fromX:6200,title:'The Outer Ember Rift',spawn:'exp_outer_rift',back:'return_outer_rift',returnX:6250,platforms:[[0,1430,900,120,'stone'],[1080,1240,460,28,'metal'],[1700,1040,500,28,'stone'],[2380,1240,500,28,'metal'],[3060,1430,1540,120,'stone']],hazards:[{type:'fire',rect:{x:900,y:1410,w:180,h:20},damage:14},{type:'void',rect:{x:2880,y:1410,w:180,h:20},damage:18}],enemies:[{type:'hollow_shade',x:1900,y:1000,patrol:[1740,2180]}]},
  ];
  const mainByRegion=new Map(sources.map(s=>[s.region,{seg:segByRegion.get(s.region)!,floorY:s.floorY}]));
  for(const exp of expansions){
    const main=mainByRegion.get(exp.region)!,px=exp.x,py=exp.y;
    level.spawns[exp.spawn]={x:px+160,y:py+exp.h-180};
    level.spawns[exp.back]={x:main.seg.offsetX+exp.returnX,y:main.seg.offsetY+main.floorY-60};
    segments.push({region:exp.region,levelId:exp.visual,offsetX:px,offsetY:py,width:exp.w,height:exp.h});
    level.platforms.push(...exp.platforms.map(([x,y,w,h,k]:any[])=>[px+x,py+y,w,h,k] as any));
    level.hazards.push(...exp.hazards.map((h:any)=>({...h,rect:{...h.rect,x:h.rect.x+px,y:h.rect.y+py}})));
    level.enemies.push(...exp.enemies.map((e:any)=>({...e,x:e.x+px,y:e.y+py,region:exp.region,patrol:e.patrol?[e.patrol[0]+px,e.patrol[1]+px]:undefined})));
    level.zones.push({id:`exp_${exp.id}`,rect:{x:px,y:py+300,w:exp.w,h:exp.h-300}} as any);
    const enter=`enter_${exp.id}`,back=`back_${exp.id}`;
    level.exits.push({id:enter,rect:{x:main.seg.offsetX+exp.fromX,y:main.seg.offsetY+main.floorY-160,w:100,h:160},to:{level:'aoc_overworld',spawn:exp.spawn}} as any);
    level.exits.push({id:back,rect:{x:px,y:py+exp.h-300,w:100,h:180},to:{level:'aoc_overworld',spawn:exp.back}} as any);
    exitSources[enter]={teleport:true,spawnName:exp.spawn};exitSources[back]={teleport:true,spawnName:exp.back};
    level.lore.push({id:`l_exp_${exp.id}`,kind:'mural',x:px+exp.w-420,y:py+exp.h-180,text:exp.title} as any);
  }
  level.size.w=Math.max(level.size.w,...segments.map(s=>s.offsetX+s.width))+240;
  level.size.h=Math.max(level.size.h,...segments.map(s=>s.offsetY+s.height))+240;
  return {level,npcs,collectibles,hiddenPaths,segments,exitSources};
}
