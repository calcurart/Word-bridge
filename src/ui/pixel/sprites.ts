// Hand-drawn pixel art, one character per pixel. '.' is transparent; every other character is a palette key.
// Rows shorter than the sprite's width are padded with transparent pixels on the right.

export type Sprite = { readonly width: number; readonly height: number; readonly rows: readonly string[] }

export type Palette = Readonly<Record<string, string>>

function sprite(rows: readonly string[]): Sprite {
  return { width: Math.max(...rows.map(row => row.length)), height: rows.length, rows }
}

/** Dash, the raptor who crosses the bridge: orange with hot-red quills, a toothy grin and blue running shoes. */
export const DINO_PALETTE: Palette = {
  K: '#2a1433', // outline
  O: '#ff8a1f', // body
  o: '#d6560e', // body shade
  Y: '#ffd84a', // belly
  W: '#ffffff', // eye
  P: '#1b2a8f', // pupil
  R: '#ff3d5a', // quills
  r: '#b81d3c', // quill shade
  S: '#2f7bff', // shoes
  s: '#1846b8', // shoe shade
  w: '#f4f1ea', // soles
  T: '#fff6d6', // teeth
}

// Shared head, quills and body; the frames differ only in the legs.
const DINO_TOP = [
  '...............KKKKK......',
  '..KKK.........KOOOOOKK....',
  '..KRRKK......KOOOOOOOOK...',
  '...KRRRKK...KOOKKKKOOOOK..',
  '....KrRRRKKKKOOWWWWOOOOOK.',
  '.KKKKKrRRRRRKOOWWPPOOOOOOK',
  'KRRRRRRrRRRRKOOWWPPOOOOOOK',
  '.KKrRRRRRRRKOOOWWWWOOOOOOK',
  '...KKKrRRRKOOOOOOOOOKKKKKK',
  '..KKRRRRRKOOOOOOOOOKTKTKTK',
  '.KRRRRrRKOOOOOOOOOOOKKKKK.',
  'KKKKKKKOOOOOOOOOOYYYK.....',
  'KOOOOOOOOOOOOOOYYYYYKK....',
  '.KKOOOOOOOOOOOYYYYYKOOK...',
  '...KKKoOOOOOOYYYYYKKOK....',
  '.....KKooOOOOYYYYKKKK.....',
]

export const DINO_RUN_A = sprite([
  ...DINO_TOP,
  '......KooOKKKOOOYK........',
  '.....KooOK...KOOOK........',
  '....KooOK.....KoOOK.......',
  '...KSSK.......KoOOK.......',
  '.KKSSSK.......KSSSSKK.....',
  'KwSSSsK......KwSSSSSSK....',
  'KwwwwwK......KwwwwwwwK....',
  '.KKKKK........KKKKKKK.....',
])

export const DINO_RUN_B = sprite([
  ...DINO_TOP,
  '.......KoOOOOOOYK.........',
  '.......KoOKKKoOOK.........',
  '......KSSSK..KoOK.........',
  '.....KwSSSSK.KoOOK........',
  '.....KwwwwwK.KSSSSKK......',
  '......KKKKK.KwSSSSSSK.....',
  '............KwwwwwwwK.....',
  '.............KKKKKKK......',
])

/** Arms-up pose for a finished bridge. */
export const DINO_CHEER = sprite([
  '...............KKKKK......',
  '..KKK.........KOOOOOKK....',
  '..KRRKK......KOOOOOOOOK...',
  '...KRRRKK...KOOKKKKOOOOK..',
  '....KrRRRKKKKOOWWWWOOOOOK.',
  '.KKKKKrRRRRRKOOWWPPOOOOOOK',
  'KRRRRRRrRRRRKOOWWPPOOOOOOK',
  '.KKrRRRRRRRKOOOWWWWOOOOOOK',
  '...KKKrRRRKOOOOOOOOOKKKKKK',
  '..KKRRRRRKOOOOOOOOOKTTTTTK',
  '.KRRRRrRKOOOOOOOOOOOKKKKK.',
  'KKKKKKKOOOOOOOOOOYYYK.KK..',
  'KOOOOOOOOOOOOOOYYYYYKKOK..',
  '.KKOOOOOOOOOOOYYYYYKOOK...',
  '...KKKoOOOOOOYYYYYKKK.....',
  '.....KKooOOOOYYYYKK.......',
  '......KoOOOOOOOOYK........',
  '......KoOK...KoOOK........',
  '......KoOK...KoOOK........',
  '......KoOK...KoOOK........',
  '....KKSSSK...KSSSSKK......',
  '...KwSSSSK..KwSSSSSSK.....',
  '...KwwwwwK..KwwwwwwwK.....',
  '....KKKKK....KKKKKKK......',
])

export const CLOUD = sprite([
  '........KKKKK...........',
  '......KKWWWWWKK.........',
  '.....KWWWWWWWWWK..KKK...',
  '..KKKWWWWWWWWWWWKKWWWK..',
  '.KWWWWWWWWWWWWWWWWWWWWK.',
  'KWWWWWWWWWWWWWWWWWWWWWWK',
  'KWWWWWWWWWWWWWWWWWWWWccK',
  '.KccWWWWWWWWWWWWccccccK.',
  '..KKcccccccccccccccKKK..',
  '....KKKKKKKKKKKKKKK.....',
])

export const CLOUD_PALETTE: Palette = { K: '#7fb6e8', W: '#ffffff', c: '#d8ecff' }

/** A little cycad (prehistoric palm) that grows on the bigger pieces of land. */
export const FERN = sprite([
  '..KK.....KK..',
  '.KGGK...KGGK.',
  'KGgGGK.KGGgGK',
  'KgKKGGKGGKKgK',
  '.K..KGGGK..K.',
  '...KGGgGGK...',
  '..KgK.B.KgK..',
  '..K...B...K..',
  '......B......',
  '.....BbB.....',
])

export const FERN_PALETTE: Palette = { K: '#14532d', G: '#3fdc5a', g: '#22a447', B: '#8a4b20', b: '#5c2e12' }

/** A speckled egg for answers almost nobody else finds. */
export const EGG = sprite([
  '..KKK..',
  '.KWWWK.',
  'KWpWWWK',
  'KWWWpWK',
  'KpWWWWK',
  'KWWpWsK',
  '.KsssK.',
  '..KKK..',
])

export const EGG_PALETTE: Palette = { K: '#2a1433', W: '#fff4d1', p: '#5ab4ff', s: '#e6cf98' }
