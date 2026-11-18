// Puzzle collection. Every puzzle connects `start` to `end` through `gaps` missing
// words. `solution` is one canonical answer, used for reveals; any other bridge
// whose links all exist in ./links.ts is accepted too.
//
// IDs are permanent: the daily schedule (src/lib/schedule.ts) and players' saved
// games refer to them. Never rename, reuse or delete an ID once it has shipped.
// Easy puzzles have 2 gaps (3 links); standard puzzles have 3 gaps (4 links).

export type Difficulty = 'easy' | 'standard'

export type Puzzle = {
  readonly id: string
  readonly start: string
  readonly end: string
  readonly gaps: number
  readonly solution: readonly string[]
  readonly difficulty: Difficulty
  /** Editorial note for maintainers. Never shown during play. */
  readonly note?: string
}

export const PUZZLES: readonly Puzzle[] = [
  // Standard: three missing words
  { id: 'rain-shop', start: 'rain', end: 'shop', gaps: 3, solution: ['forest', 'fire', 'work'], difficulty: 'standard' },
  { id: 'snow-press', start: 'snow', end: 'press', gaps: 3, solution: ['ball', 'park', 'bench'], difficulty: 'standard' },
  { id: 'tooth-dog', start: 'tooth', end: 'dog', gaps: 3, solution: ['pick', 'pocket', 'watch'], difficulty: 'standard' },
  { id: 'race-office', start: 'race', end: 'office', gaps: 3, solution: ['horse', 'shoe', 'box'], difficulty: 'standard' },
  { id: 'tea-way', start: 'tea', end: 'way', gaps: 3, solution: ['cup', 'board', 'walk'], difficulty: 'standard', note: 'CUP CAKE WALK also works.' },
  { id: 'touch-hold', start: 'touch', end: 'hold', gaps: 3, solution: ['screen', 'play', 'house'], difficulty: 'standard' },
  { id: 'head-chair', start: 'head', end: 'chair', gaps: 3, solution: ['band', 'wagon', 'wheel'], difficulty: 'standard' },
  { id: 'dragon-bell', start: 'dragon', end: 'bell', gaps: 3, solution: ['fly', 'trap', 'door'], difficulty: 'standard' },
  { id: 'water-ladder', start: 'water', end: 'ladder', gaps: 3, solution: ['front', 'door', 'step'], difficulty: 'standard' },
  { id: 'book-house', start: 'book', end: 'house', gaps: 3, solution: ['shelf', 'life', 'boat'], difficulty: 'standard' },
  { id: 'star-hat', start: 'star', end: 'hat', gaps: 3, solution: ['fish', 'tank', 'top'], difficulty: 'standard' },
  { id: 'day-court', start: 'day', end: 'court', gaps: 3, solution: ['break', 'fast', 'food'], difficulty: 'standard' },
  { id: 'cross-floor', start: 'cross', end: 'floor', gaps: 3, solution: ['word', 'play', 'ground'], difficulty: 'standard' },
  { id: 'finger-file', start: 'finger', end: 'file', gaps: 3, solution: ['tip', 'toe', 'nail'], difficulty: 'standard' },
  { id: 'small-question', start: 'small', end: 'question', gaps: 3, solution: ['business', 'card', 'trick'], difficulty: 'standard' },
  { id: 'table-stick', start: 'table', end: 'stick', gaps: 3, solution: ['tennis', 'court', 'yard'], difficulty: 'standard' },
  { id: 'sea-dust', start: 'sea', end: 'dust', gaps: 3, solution: ['food', 'chain', 'saw'], difficulty: 'standard' },
  { id: 'goal-room', start: 'goal', end: 'room', gaps: 3, solution: ['post', 'card', 'board'], difficulty: 'standard' },
  { id: 'pass-bulb', start: 'pass', end: 'bulb', gaps: 3, solution: ['word', 'search', 'light'], difficulty: 'standard' },
  { id: 'wind-flower', start: 'wind', end: 'flower', gaps: 3, solution: ['mill', 'stone', 'wall'], difficulty: 'standard' },
  { id: 'school-post', start: 'school', end: 'post', gaps: 3, solution: ['bus', 'stop', 'sign'], difficulty: 'standard' },
  { id: 'salt-case', start: 'salt', end: 'case', gaps: 3, solution: ['water', 'slide', 'show'], difficulty: 'standard' },
  { id: 'night-pot', start: 'night', end: 'pot', gaps: 3, solution: ['club', 'house', 'plant'], difficulty: 'standard' },
  { id: 'life-trip', start: 'life', end: 'trip', gaps: 3, solution: ['guard', 'rail', 'road'], difficulty: 'standard' },
  { id: 'coffee-line', start: 'coffee', end: 'line', gaps: 3, solution: ['bean', 'bag', 'pipe'], difficulty: 'standard' },
  { id: 'gold-bag', start: 'gold', end: 'bag', gaps: 3, solution: ['rush', 'hour', 'hand'], difficulty: 'standard' },
  { id: 'lumber-punch', start: 'lumber', end: 'punch', gaps: 3, solution: ['jack', 'pot', 'hole'], difficulty: 'standard' },
  { id: 'pine-cake', start: 'pine', end: 'cake', gaps: 3, solution: ['apple', 'sauce', 'pan'], difficulty: 'standard' },
  { id: 'ear-hole', start: 'ear', end: 'hole', gaps: 3, solution: ['ring', 'master', 'key'], difficulty: 'standard' },
  { id: 'arm-life', start: 'arm', end: 'life', gaps: 3, solution: ['band', 'stand', 'still'], difficulty: 'standard' },
  { id: 'green-race', start: 'green', end: 'race', gaps: 3, solution: ['light', 'house', 'boat'], difficulty: 'standard' },
  { id: 'hair-mat', start: 'hair', end: 'mat', gaps: 3, solution: ['brush', 'fire', 'place'], difficulty: 'standard' },
  { id: 'sand-dream', start: 'sand', end: 'dream', gaps: 3, solution: ['storm', 'drain', 'pipe'], difficulty: 'standard' },
  { id: 'moon-mark', start: 'moon', end: 'mark', gaps: 3, solution: ['light', 'year', 'book'], difficulty: 'standard' },
  { id: 'hot-show', start: 'hot', end: 'show', gaps: 3, solution: ['spring', 'board', 'game'], difficulty: 'standard' },
  { id: 'chocolate-tag', start: 'chocolate', end: 'tag', gaps: 3, solution: ['bar', 'code', 'name'], difficulty: 'standard' },
  { id: 'news-ship', start: 'news', end: 'ship', gaps: 3, solution: ['paper', 'boy', 'friend'], difficulty: 'standard' },
  { id: 'foot-smith', start: 'foot', end: 'smith', gaps: 3, solution: ['note', 'pad', 'lock'], difficulty: 'standard' },

  // Easy: two missing words
  { id: 'flash-fright', start: 'flash', end: 'fright', gaps: 2, solution: ['back', 'stage'], difficulty: 'easy' },
  { id: 'eye-service', start: 'eye', end: 'service', gaps: 2, solution: ['ball', 'room'], difficulty: 'easy' },
  { id: 'pop-crumb', start: 'pop', end: 'crumb', gaps: 2, solution: ['corn', 'bread'], difficulty: 'easy' },
  { id: 'shoe-bag', start: 'shoe', end: 'bag', gaps: 2, solution: ['string', 'bean'], difficulty: 'easy' },
  { id: 'bull-bone', start: 'bull', end: 'bone', gaps: 2, solution: ['dog', 'collar'], difficulty: 'easy' },
  { id: 'egg-bowl', start: 'egg', end: 'bowl', gaps: 2, solution: ['shell', 'fish'], difficulty: 'easy' },
  { id: 'cow-mint', start: 'cow', end: 'mint', gaps: 2, solution: ['bell', 'pepper'], difficulty: 'easy' },
  { id: 'black-robe', start: 'black', end: 'robe', gaps: 2, solution: ['bird', 'bath'], difficulty: 'easy' },
  { id: 'key-mate', start: 'key', end: 'mate', gaps: 2, solution: ['board', 'room'], difficulty: 'easy' },
  { id: 'wall-board', start: 'wall', end: 'board', gaps: 2, solution: ['paper', 'clip'], difficulty: 'easy' },
  { id: 'picnic-game', start: 'picnic', end: 'game', gaps: 2, solution: ['basket', 'ball'], difficulty: 'easy' },
  { id: 'drum-center', start: 'drum', end: 'center', gaps: 2, solution: ['roll', 'call'], difficulty: 'easy', note: 'Shown as CENTER; CENTRE is an accepted spelling in gaps.' },
  { id: 'red-room', start: 'red', end: 'room', gaps: 2, solution: ['head', 'rest'], difficulty: 'easy' },
  { id: 'home-way', start: 'home', end: 'way', gaps: 2, solution: ['town', 'hall'], difficulty: 'easy' },
  { id: 'ice-cake', start: 'ice', end: 'cake', gaps: 2, solution: ['cream', 'cheese'], difficulty: 'easy' },
  { id: 'back-link', start: 'back', end: 'link', gaps: 2, solution: ['hand', 'cuff'], difficulty: 'easy' },
  { id: 'under-bug', start: 'under', end: 'bug', gaps: 2, solution: ['water', 'bed'], difficulty: 'easy' },
  { id: 'jelly-work', start: 'jelly', end: 'work', gaps: 2, solution: ['fish', 'net'], difficulty: 'easy' },
  { id: 'wood-show', start: 'wood', end: 'show', gaps: 2, solution: ['land', 'slide'], difficulty: 'easy' },
  { id: 'swim-study', start: 'swim', end: 'study', gaps: 2, solution: ['suit', 'case'], difficulty: 'easy' },
  { id: 'car-buckle', start: 'car', end: 'buckle', gaps: 2, solution: ['seat', 'belt'], difficulty: 'easy' },
  { id: 'cart-lift', start: 'cart', end: 'lift', gaps: 2, solution: ['wheel', 'chair'], difficulty: 'easy' },
  { id: 'mouse-knob', start: 'mouse', end: 'knob', gaps: 2, solution: ['trap', 'door'], difficulty: 'easy' },
  { id: 'sweet-dressing', start: 'sweet', end: 'dressing', gaps: 2, solution: ['potato', 'salad'], difficulty: 'easy' },
  { id: 'birth-line', start: 'birth', end: 'line', gaps: 2, solution: ['day', 'time'], difficulty: 'easy' },
  { id: 'peanut-board', start: 'peanut', end: 'board', gaps: 2, solution: ['butter', 'cup'], difficulty: 'easy' },
  { id: 'fire-work', start: 'fire', end: 'work', gaps: 2, solution: ['alarm', 'clock'], difficulty: 'easy' },
  { id: 'honey-house', start: 'honey', end: 'house', gaps: 2, solution: ['moon', 'light'], difficulty: 'easy' },
  { id: 'tissue-bone', start: 'tissue', end: 'bone', gaps: 2, solution: ['paper', 'back'], difficulty: 'easy' },
  { id: 'bed-cloth', start: 'bed', end: 'cloth', gaps: 2, solution: ['time', 'table'], difficulty: 'easy' },
  { id: 'junk-hole', start: 'junk', end: 'hole', gaps: 2, solution: ['mail', 'man'], difficulty: 'easy' },
]

export const PUZZLE_BY_ID: ReadonlyMap<string, Puzzle> = new Map(PUZZLES.map(puzzle => [puzzle.id, puzzle]))

/** The worked example used by the tutorial. It is not part of the daily or practice rotation. */
export const TUTORIAL = { start: 'sun', end: 'hole', solution: ['flower', 'pot'] } as const
