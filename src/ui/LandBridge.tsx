import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { rarity } from '../lib/challenge.ts'
import type { Rarity } from '../lib/challenge.ts'
import type { AnswerResult } from '../lib/online.ts'
import { Dino, DINO_SIZE, EarthPattern, LandChunk, usePatternId } from './pixel/Pixel.tsx'
import type { LandDecor } from './pixel/Pixel.tsx'

// Challenge mode's land bridge: every answer raises a piece of land out of the sea, and the rarer the
// answer the bigger the piece. Dash hops onto the newest piece. One point is one kilometre of bridge.

const HEIGHT = 64 // pixels
const SEA = 8 // water showing below the land
const GAP = 5
const SHORE = 30
const TAIL = 46 // open sea ahead of Dash

const RISE: Record<Rarity['tier'], number> = { common: 8, uncommon: 11, rare: 14, 'very-rare': 17, impossible: 21 }
const DECOR: Record<Rarity['tier'], LandDecor> = { common: 'none', uncommon: 'none', rare: 'fern', 'very-rare': 'ferns', impossible: 'egg' }

export function pieceWidth(points: number): number {
  return Math.round(12 + points * 0.62)
}

type Props = {
  results: readonly AnswerResult[]
  /** Follow the newest piece while a run is on. */
  live?: boolean
}

export function LandBridge({ results, live = false }: Props) {
  const patternId = usePatternId()
  const scroller = useRef<HTMLDivElement>(null)
  const km = results.reduce((sum, item) => sum + item.points, 0)

  let x = 0
  const shore = { x, width: SHORE, rise: 10 }
  x += SHORE + GAP
  const pieces = results.map(item => {
    const tier = rarity(item.points).tier
    const piece = { item, tier, x, width: pieceWidth(item.points), rise: RISE[tier] }
    x += piece.width + GAP
    return piece
  })
  const width = x + TAIL
  const last = pieces.at(-1) ?? shore
  const top = (rise: number) => HEIGHT - SEA - rise
  const dinoX = last.x + Math.max(0, last.width - DINO_SIZE.width - 2)
  const dinoY = top(last.rise) - DINO_SIZE.height

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const smooth = live && !matchMedia('(prefers-reduced-motion: reduce)').matches
    element.scrollTo({ left: element.scrollWidth, behavior: smooth ? 'smooth' : 'auto' })
  }, [results.length, live])

  return (
    <figure className={`landbridge${live ? ' landbridge--live' : ''}`}>
      <div className="landbridge__scroller" ref={scroller}>
        <svg
          className="landbridge__art" viewBox={`0 0 ${width} ${HEIGHT}`} style={{ '--w': width, '--h': HEIGHT } as CSSProperties}
          shapeRendering="crispEdges" aria-hidden="true" focusable="false"
        >
          <defs><EarthPattern id={patternId} /></defs>
          <LandChunk patternId={patternId} x={shore.x} y={top(shore.rise)} width={shore.width} height={shore.rise + SEA} />
          {pieces.map((piece, index) => (
            <g key={index} className={`landbridge__piece${live && index === pieces.length - 1 ? ' landbridge__piece--new' : ''}`}>
              <LandChunk
                patternId={patternId} x={piece.x} y={top(piece.rise)} width={piece.width} height={piece.rise + SEA}
                decor={piece.width >= 30 ? DECOR[piece.tier] : 'none'}
              />
              <text className="landbridge__points" x={piece.x + piece.width / 2} y={top(piece.rise) + Math.min(piece.rise, 12) - 1}>
                {piece.item.points}
              </text>
            </g>
          ))}
          <rect className="landbridge__sea" x="0" y={HEIGHT - SEA} width={width} height={SEA} />
          <path className="landbridge__foam" d={foam(width)} />
          <g className="landbridge__dash" style={{ transform: `translate(${dinoX}px, ${dinoY}px)` }}>
            <g key={results.length} className="landbridge__hop">
              <Dino pose={live ? 'run' : 'stand'} width={DINO_SIZE.width} height={DINO_SIZE.height} />
            </g>
          </g>
        </svg>
      </div>
      <figcaption className="landbridge__caption">
        <span className="landbridge__km">{km.toLocaleString()} km</span>
        <span className="landbridge__tag">{results.length === 0 ? 'Every word raises land. Rare words raise more.' : 'How far can you go?'}</span>
      </figcaption>
    </figure>
  )
}

function foam(width: number): string {
  let d = ''
  for (let x = 3; x < width; x += 13) d += `M${x} ${HEIGHT - SEA}h3v1h-3z `
  return d
}
