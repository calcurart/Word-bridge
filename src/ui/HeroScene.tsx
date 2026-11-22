import type { CSSProperties, ReactNode } from 'react'
import { Cloud, Dino, EarthPattern, LandChunk, usePatternId } from './pixel/Pixel.tsx'
import type { LandDecor } from './pixel/Pixel.tsx'

// The masthead: a side-scrolling pixel world where Dash runs across a prehistoric land bridge, jumping the
// gaps between pieces of land. Bigger pieces stand for rarer answers. Everything here is decorative.

type Piece = { width: number; gap: number; decor?: LandDecor }

/** One loop of the ground: land width then the sea gap after it, in pixels. */
const GROUND: readonly Piece[] = [
  { width: 44, gap: 16 },
  { width: 96, gap: 18, decor: 'ferns' },
  { width: 30, gap: 16 },
  { width: 150, gap: 20, decor: 'egg' },
  { width: 64, gap: 16, decor: 'fern' },
  { width: 36, gap: 16 },
  { width: 118, gap: 20, decor: 'fern' },
  { width: 76, gap: 16 },
]
const LOOP = GROUND.reduce((sum, piece) => sum + piece.width + piece.gap, 0)
const GROUND_HEIGHT = 44
const LAND_TOP = 12
const SPEED = 92 // pixels per second
const DURATION = LOOP / SPEED
const JUMP_HEIGHT = 17

const pieces = (() => {
  let x = 0
  return GROUND.map(piece => {
    const placed = { ...piece, x }
    x += piece.width + piece.gap
    return placed
  })
})()

/**
 * Keyframes that lift Dash over every gap. The ground moves left under a fixed Dash, so the gap that
 * starts at `s` reaches Dash's front foot when the ground has moved `s - 22` pixels.
 */
function jumpKeyframes(): string {
  const pct = (px: number) => `${((px / LOOP) * 100).toFixed(3)}%`
  const frames = ['0% { transform: translateY(0); }']
  for (const piece of pieces) {
    const start = piece.x + piece.width - 24
    const end = piece.x + piece.width + piece.gap + 2
    const mid = (start + end) / 2
    frames.push(`${pct(start)} { transform: translateY(0); animation-timing-function: cubic-bezier(0.2, 0.7, 0.4, 1); }`)
    frames.push(`${pct(mid)} { transform: translateY(calc(var(--u) * ${-JUMP_HEIGHT})); animation-timing-function: cubic-bezier(0.6, 0, 0.8, 0.3); }`)
    frames.push(`${pct(end)} { transform: translateY(0); }`)
  }
  frames.push('100% { transform: translateY(0); }')
  return `@keyframes hero-jump { ${frames.join(' ')} }`
}
const JUMP_CSS = jumpKeyframes()

function GroundStrip() {
  const patternId = usePatternId()
  const copies = [0, 1, 2]
  return (
    <svg
      className="hero__ground" viewBox={`0 0 ${LOOP * 3} ${GROUND_HEIGHT}`}
      shapeRendering="crispEdges" aria-hidden="true" focusable="false"
    >
      <defs><EarthPattern id={patternId} /></defs>
      {copies.map(copy => (
        <g key={copy}>
          {pieces.map(piece => (
            <LandChunk
              key={piece.x} patternId={patternId} x={copy * LOOP + piece.x} y={LAND_TOP}
              width={piece.width} height={GROUND_HEIGHT - LAND_TOP} decor={piece.decor}
            />
          ))}
        </g>
      ))}
    </svg>
  )
}

/** Far mountains with a smoking volcano, as a stepped pixel silhouette that tiles every 320 pixels. */
function Mountains() {
  const ridge = 'M0 40V30h8v-4h6v-6h8v-6h6v4h6v6h8v-4h10v-8h6v-6h6v4h4v8h8v6h10v-6h8v-8h6v-6h4v-4h8v4h4v6h6v10h8v6h12v-4h8v-6h6v4h6v6h10v4h8v-8h8v-10h4v-6h10v6h4v10h8v8h10v-4h8v-6h6v-4h6v6h8v8h8v6h10v-6h10v-4h6v4h8v6h26V40z'
  return (
    <svg className="hero__mountains" viewBox="0 -8 960 48" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {[0, 320, 640].map(dx => (
        <g key={dx} transform={`translate(${dx} 0)`}>
          <path className="hero__ridge" d={ridge} />
          {/* volcano */}
          <path className="hero__volcano" d="M188 40V30h6v-6h6v-6h6v-6h4v-2h16v2h4v6h6v6h6v6h6v10z" />
          <path className="hero__lava" d="M210 10h16v2h-3v4h-2v-4h-5v7h-2v-7h-4z" />
          <g className="hero__smoke">
            <rect className="hero__puff hero__puff--1" x="214" y="4" width="6" height="4" />
            <rect className="hero__puff hero__puff--2" x="219" y="0" width="4" height="4" />
            <rect className="hero__puff hero__puff--3" x="212" y="-4" width="4" height="3" />
          </g>
        </g>
      ))}
    </svg>
  )
}

export function HeroScene({ children }: { children: ReactNode }) {
  const style = { '--loop': LOOP, '--hero-duration': `${DURATION}s` } as CSSProperties
  return (
    <div className="hero" style={style}>
      <style>{JUMP_CSS}</style>
      <div className="hero__scene" aria-hidden="true">
        <div className="hero__stars" />
        <div className="hero__sun" />
        <Cloud className="hero__cloud hero__cloud--1" scale={3} />
        <Cloud className="hero__cloud hero__cloud--2" scale={2} />
        <Cloud className="hero__cloud hero__cloud--3" scale={3} />
        <div className="hero__far"><Mountains /></div>
        <div className="hero__track"><GroundStrip /></div>
        <div className="hero__runner"><Dino className="hero__dino" scale={1} /></div>
        <div className="hero__sea" />
      </div>
      <div className="hero__content">{children}</div>
    </div>
  )
}
