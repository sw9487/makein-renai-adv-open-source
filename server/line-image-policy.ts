import {prompt} from './prompt';

/** Intent is evaluated by the LLM; no keyword gate on player messages. */
export const lineImagePolicy=()=>prompt('image.linePolicy');
