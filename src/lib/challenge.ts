// Challenge mode settings shared by the game and the server. Answers are checked and scored on the server
// (worker/src/challenge-engine.ts), against a large dictionary built from Wiktionary.
//
// SINGLE: one word that comes AFTER the prompt (FOREST -> FIRE, "forest fire").
// DOUBLE: one word BEFORE and one AFTER the prompt (RAIN + FIRE -> "rainforest" + "forest fire").
// Each word scores 10 (obvious) to 100 (nearly impossible), from how common it is and how rarely other players give it.

export type ChallengeMode = 'single' | 'double'

export const CHALLENGE_SECONDS = 300
export const SKIP_PENALTY_SECONDS = 10

/** "4:05" style clock. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export type Rarity = { readonly label: string; readonly tier: 'common' | 'uncommon' | 'rare' | 'very-rare' | 'impossible' }

export function rarity(points: number): Rarity {
  if (points >= 90) return { label: 'Nearly impossible', tier: 'impossible' }
  if (points >= 70) return { label: 'Very rare', tier: 'very-rare' }
  if (points >= 45) return { label: 'Rare', tier: 'rare' }
  if (points >= 25) return { label: 'Uncommon', tier: 'uncommon' }
  return { label: 'Common', tier: 'common' }
}
