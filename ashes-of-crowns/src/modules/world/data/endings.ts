import type { EndingDef } from '../types';
import { AND, COMP, CNT, F, LOY, NOT, OR, V } from './dsl';
import { REVEAL_REQ, TRUE_KING_REQ } from './conditions';

/**
 * ENDING LOGIC (see README for the full table)
 *  gate   — hard requirement on hidden variables, flags, companions, recovered truth
 *  score  — base + weights*vars + bonuses; highest eligible score wins. 'wanderer' always passes its gate (fallback).
 * The final choice is only ONE input: every gate also checks accumulated Honor/Trust/Ambition/Mercy,
 * companion loyalty or collected evidence, so earlier regions decide what is possible at Crownfall.
 */
const shared = {
  hearth: { when: F('village_hope'), text: 'In Hearthmere, the cellar was emptied, and the first new bell rang over the ashes.' },
  forest: { when: F('thornwarden_cleansed'), text: 'The Hollow Oak bloomed in winter. The Whisperers sang a name that was not a title.' },
  highland: { when: F('highland_oath'), text: 'In Stormhold, the clans lit the Northern Company\'s cairns, one flame for each of the eight hundred.' },
  elen: { when: F('elen_freed'), text: 'Elen grew up in Stormhold\'s warm halls. When asked who saved her, she said "a man with a sun on his sword."' },
};

export const endings: EndingDef[] = [
  {
    id: 'true_king', title: 'The True King', tagline: 'Not the Crown. The heart beneath it.', priority: 4, base: 20,
    weights: { honor: 2, trust: 2, mercy: 1 },
    gate: AND(F('final_throne'), TRUE_KING_REQ, NOT(F('aren_fell')), V('mercy', '>=', 0)),
    bonus: [{ when: F('aldric_blessing'), add: 6 }, { when: F('forest_pact'), add: 3 }, { when: F('highland_oath'), add: 3 }, { when: F('darken_redeemed'), add: 4 }],
    slides: [
      { text: 'Aren Valcrest did not seize the Crown. The people of Crownfall, weary of ash, offered him the throne. He took it with open hands — and broke the old rite so the Crown could never again drink its bearer.' },
      { when: F('aldric_blessing'), text: 'He wore the King\'s last blessing in his pocket. He read it at every coronation, aloud.' },
      { when: F('darken_redeemed'), text: 'Darken Holt served as his marshal, oath-sworn, and never once sat in the high seat.' },
      { when: F('darken_spared'), text: 'Darken stood trial. The council gave him a life sentence in the Northern Company\'s old fort, tending the cairns.' },
      shared.hearth, shared.forest, shared.highland,
      { text: 'Historians call his reign the Ember Peace. Hearthmere, when asked, simply calls it Home.' },
    ],
  },
  {
    id: 'tyrant', title: 'The Tyrant', tagline: 'Power does not ask what you were. Only what you will do.', priority: 3, base: 20,
    weights: { ambition: 2, honor: -1, mercy: -1 },
    gate: AND(F('final_claim'), OR(V('ambition', '>=', 4), V('honor', '<=', 0))),
    bonus: [{ when: F('took_regalia'), add: 4 }, { when: F('darken_killed'), add: 3 }, { when: F('elen_leverage'), add: 4 }],
    slides: [
      { text: 'Aren lifted the Ember Crown and it fit as if it had always been waiting. The Hushed bent their masks to him. The kingdom bent after.' },
      { when: F('darken_killed'), text: 'Darken Holt\'s body hung above the Palace Gate as a lesson. Nobody wept in the open.' },
      { when: F('elen_leverage'), text: 'Elen Holt grew up in the palace. She never spoke to the king. She never needed to; the court knew what silence meant.' },
      { when: F('promised_highlands'), text: 'The Highlands, promised freedom, found it was an unpaid debt. The clans answered with swords.' },
      { text: 'The Crown drank his years and gave him armies. When he was old at thirty, the kingdom was a very quiet place.' },
      { text: 'Children in Hearthmere still sing of Aren Valcrest. The verses have changed. The last one is a warning.' },
    ],
  },
  {
    id: 'wanderer', title: 'The Wanderer', tagline: 'Some stories end by leaving.', priority: 1, base: 5,
    weights: { mercy: 1, ambition: -1 },
    gate: AND(), // fallback: always eligible
    bonus: [{ when: F('final_walk'), add: 12 }, { when: F('unbind_clean'), add: 14 }, { when: F('final_throne'), add: -4 }],
    slides: [
      { when: F('unbind_clean'), text: 'Aren spoke the Queen\'s rite and offered the Crown a gift it could not drink. It cooled in his hands. He left the ashes where they fell.' },
      { when: F('final_walk'), text: 'Aren laid his sword on the throne and walked out of Crownfall as the sun rose. No one stopped him; no one quite knew how.' },
      { when: F('darken_spared'), text: 'Darken was left to the realm\'s justice. Some say he was exiled. Some say he followed, a day behind, forever.' },
      { when: F('darken_killed'), text: 'Darken Holt was buried without a stone. Aren stayed beside the grave until dawn and then went east without a word.' },
      shared.hearth, shared.forest, shared.highland,
      { text: 'A stranger with a scorched sun on his sword is sometimes seen on mountain roads and desert crossings. He stays one night, pays for his bread, and is gone by morning. They call him the Wanderer.' },
    ],
  },
  {
    id: 'hidden_truth', title: 'The Hidden Truth', tagline: 'Let the realm judge itself.', priority: 5, base: 20,
    weights: { honor: 1, trust: 2, mercy: 1 },
    gate: AND(F('final_reveal'), REVEAL_REQ, NOT(F('aren_fell'))),
    bonus: [{ when: CNT('frag_', 5), add: 6 }, { when: F('pell_witness'), add: 4 }, { when: F('learned_saltmarch_truth'), add: 3 }, { when: F('elen_freed'), add: 3 }, { when: F('idris_accountable'), add: 2 }],
    slides: [
      { text: 'Aren stood on the palace steps with five torn pages and read the King\'s own words to a silent city: the Feast, the poison, the Chancellor, the Crown\'s hunger.' },
      { when: F('pell_witness'), text: 'Courier Pell stepped from the crowd and swore to every word. The square wept.' },
      { when: F('learned_saltmarch_truth'), text: 'The Saltmarch letters were read aloud too. Eight hundred names. Darken Holt wept in the front row.' },
      { when: F('idris_accountable'), text: 'Idris Qamar stood beside Aren and confessed his part. The council spared him for it.' },
      { text: 'The old monarchy dissolved into a council of regions: Forest, Desert, Highlands, Hollow, and the Capital. No crown. A table with chairs of unequal height, so no one forgets.' },
      shared.hearth, shared.forest, shared.highland, shared.elen,
      { text: 'Aren was offered a seat. He kept it for a year, then gave it to Tamsin Reed. The Hidden Truth, once spoken, is no longer hidden.' },
    ],
  },
  {
    id: 'fallen_hero', title: 'The Fallen Hero', tagline: 'The fire takes the one who will not let it go out.', priority: 2, base: 15,
    weights: { honor: -1, mercy: -1, trust: -1 },
    gate: OR(
      AND(F('darken_killed'), V('honor', '<=', 1)),
      AND(V('trust', '<=', -2), NOT(LOY(1, 0))),
      F('aren_fell'),
      AND(F('final_claim'), V('ambition', '<', 4), V('honor', '>', 0)),
    ),
    bonus: [{ when: F('aren_fell'), add: 12 }, { when: AND(F('darken_killed'), V('honor', '<=', 1)), add: 8 }, { when: F('elen_leverage'), add: 3 }],
    slides: [
      { when: F('aren_fell'), text: 'Aren broke the Crown without the rite. It shattered, and the flame inside took the nearest willing heart: his. He fell on the throne steps, the Crown\'s light still in his hands.' },
      { when: AND(F('final_claim'), V('ambition', '<', 4), V('honor', '>', 0)), text: 'He lifted the Crown, and it was too heavy for a man who had not truly wanted it. It ate through his resolve and left a husk in a king\'s robes.' },
      { when: AND(F('darken_killed'), V('honor', '<=', 1)), text: 'Darken Holt died on Aren\'s blade. The hand that had held the sword for the realm closed on vengeance and could not open again.' },
      { when: V('trust', '<=', -2), text: 'Those who might have stood beside him had long since left. The tale of the fallen hero is mostly told in empty rooms.' },
      shared.hearth,
      { text: 'Hearthmere raised a plain iron sun above Aren\'s empty grave. The bell rings once each dawn. The bell-ringer is always a child, who is told only that a good man once tried very hard.' },
    ],
  },
];
void COMP;
