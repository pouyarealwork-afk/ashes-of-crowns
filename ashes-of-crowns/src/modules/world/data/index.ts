import type { RegionContent } from '../types';
import type { ContentBundle } from '../core/ContentDB';
import { ashenVillage } from './regions/ashenVillage';
import { whisperingForest } from './regions/whisperingForest';
import { forgottenDesert } from './regions/forgottenDesert';
import { frozenHighlands } from './regions/frozenHighlands';
import { hollowCity } from './regions/hollowCity';
import { crownfall } from './regions/crownfall';
import { companions, companionQuests, companionDialogues, speakerNpcs } from './companions';
import { endings } from './endings';

/** Builds the full content bundle. Cross-cutting content (companion quests, speaker NPCs) is merged into the owning region. */
export function buildContent(): ContentBundle {
  const regions: RegionContent[] = [ashenVillage, whisperingForest, forgottenDesert, frozenHighlands, hollowCity, crownfall]
    .map(r => ({ ...r, quests: [...r.quests], npcs: [...r.npcs], dialogues: [...r.dialogues] }));
  const byId = new Map(regions.map(r => [r.region.id, r]));
  for (const q of companionQuests) byId.get(q.region)!.quests.push(q);
  for (const n of speakerNpcs) byId.get(n.region)!.npcs.push(n);
  regions[0].dialogues.push(...companionDialogues);
  return { regions, companions, endings };
}
export { companions, endings };
