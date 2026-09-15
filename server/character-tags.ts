import type {ModelFamily} from '../core/sd-profiles';
import {characterTagCatalog,type CharacterOutfit} from './character-tag-catalog';
import {prompt} from './prompt';
export type {CharacterOutfit,CharacterTagEntry} from './character-tag-catalog';

const normalize=(value:string)=>value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');

/** Return all outfits for a character matching the given name fragment (case-insensitive). */
export function getCharacterOutfits(characterName: string, family: ModelFamily): CharacterOutfit[] {
  const needle=normalize(characterName);
  if(!needle)return [];
  const entry=characterTagCatalog[family].find(e=>[e.name,...e.aliases].some(value=>{
   const candidate=normalize(value);return candidate.includes(needle)||needle.includes(candidate);
  }));
  return entry?[...entry.outfits]:[];
}

/** Return all entries (for tool schema enum generation). */
export function allCharacterNames(family: ModelFamily): string[] {
  return characterTagCatalog[family].map(e => e.name);
}

// ---------------------------------------------------------------------------
// Tool schema for the LLM to call in Pass 2
// ---------------------------------------------------------------------------

export const getCharacterTagsTool = {
  type: 'function',
  function: {
    name: 'get_character_tags',
    get description(){return prompt('image.characterTool');},
    parameters: {
      type: 'object',
      properties: {
        character: {
          type: 'string',
          get description(){return prompt('image.characterName');},
        },
        outfit: {
          type: 'string',
          get description(){return prompt('image.characterOutfit');},
        },
      },
      required: ['character', 'outfit'],
      additionalProperties: false,
    },
  },
} as const;

/**
 * Handle a get_character_tags tool call.
 * Returns a string the LLM can read: either the matched tag line, or a list of available outfits.
 */
export function handleGetCharacterTags(
  args: {character: string; outfit: string},
  family: ModelFamily,
): string {
  const outfits = getCharacterOutfits(args.character, family);
  if (outfits.length === 0) {
    return `No character matching "${args.character}" found in the ${family} guide.`;
  }
  if (!args.outfit) {
    return outfits.map(o => `${o.label}: ${o.tags}`).join('\n');
  }
  const needle = args.outfit.toLowerCase().replace(/\s+/g, '');
  const match =
    outfits.find(o => o.label.toLowerCase().replace(/\s+/g, '').includes(needle)) ??
    outfits.find(o => o.tags.toLowerCase().includes(needle));
  if (match) {
    return prompt('image.characterResult',{tags:match.tags});
  }
  // Fallback: return all outfits so LLM can pick
  return (
    `No outfit matching "${args.outfit}" found. Available outfits for ${args.character}:\n` +
    outfits.map(o => `${o.label}: ${o.tags}`).join('\n')
  );
}
