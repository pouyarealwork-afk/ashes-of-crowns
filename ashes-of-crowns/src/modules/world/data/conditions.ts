import { AND, CNT, LOY, V } from './dsl';

/** Requirements before Aren is *offered* (and endings accept) the people's throne. */
export const TRUE_KING_REQ = AND(V('honor', '>=', 4), V('trust', '>=', 3), LOY(2, 50));
/** At least four of the five testament fragments recovered. */
export const REVEAL_REQ = CNT('frag_', 4);
