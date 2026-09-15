import type {GameState} from './types';

/** Old saves predate these switches and keep both apps enabled. */
export function socialAppEnabled(state:Pick<GameState,'socialApps'>,app:'line'|'twitter'):boolean {
  return state.socialApps?.[app] !== false;
}
