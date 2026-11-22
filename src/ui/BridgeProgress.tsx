import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { carProgress } from '../lib/game.ts'
import type { LinkFeedback } from '../lib/game.ts'
import { Dino, DINO_SIZE } from './pixel/Pixel.tsx'

// These match the fixed heights of a word tile and a link in styles.css (.tile, .link), so each stop
// on the track lines up with the middle of its word.
const TILE = 60
const LINK = 58
const STEP = TILE + LINK
const WIDTH = 44
const MID = WIDTH / 2
const SCALE = 1.5
const DINO_W = DINO_SIZE.width * SCALE
const DINO_H = DINO_SIZE.height * SCALE
const STEP_SECONDS = 0.55
const ISLAND = 40 // height of each word's island
const LAND_W = 26 // width of the land between islands

type Props = {
  feedback: readonly LinkFeedback[]
  won: boolean
}

/**
 * The land bridge seen from above, running down the side of the word tiles: an island for every word and
 * a strip of land that rises out of the sea for every recognized link. Dash runs down over each recognized
 * link from the start word, stops at the shore in front of an unrecognized one, and backs up as soon as a
 * change makes a crossed link unchecked or wrong. Decorative: the links already say the same in text.
 */
export function BridgeProgress({ feedback, won }: Props) {
  const links = feedback.length
  const height = links * STEP + TILE
  const stop = (index: number) => index * STEP + TILE / 2
  const progress = carProgress(feedback)
  const blocked = progress < links && feedback[progress] === false

  const previous = useRef(progress)
  const [motion, setMotion] = useState<{ direction: 'forward' | 'back'; steps: number } | null>(null)
  useEffect(() => {
    const steps = progress - previous.current
    previous.current = progress
    if (steps === 0) return
    setMotion({ direction: steps > 0 ? 'forward' : 'back', steps: Math.abs(steps) })
    const timer = window.setTimeout(() => setMotion(null), Math.abs(steps) * STEP_SECONDS * 1000 + 60)
    return () => window.clearTimeout(timer)
  }, [progress])

  const runnerStyle = {
    transform: `translate(${MID - DINO_W / 2}px, ${stop(progress) - DINO_H + 8}px)`,
    '--travel': `${(motion?.steps ?? 1) * STEP_SECONDS}s`,
  } as CSSProperties
  const runnerClass = ['track__runner', motion && `track__runner--${motion.direction}`, blocked && !motion && 'track__runner--stuck']
    .filter(Boolean).join(' ')
  const pose = won && !motion ? 'cheer' : motion ? 'run' : 'stand'

  const islands: ReactNode[] = []
  for (let word = 0; word <= links; word++) {
    const y = stop(word) - ISLAND / 2
    islands.push(<Island key={word} y={y} goal={word === links} />)
  }

  return (
    <svg
      className={`track${won ? ' track--won' : ''}`} width={WIDTH} height={height}
      viewBox={`0 0 ${WIDTH} ${height}`} shapeRendering="crispEdges" aria-hidden="true" focusable="false"
    >
      <rect className="track__sea" x="2" y="0" width={WIDTH - 4} height={height} />
      <path className="track__foam" d={foam(height)} />

      {feedback.map((state, index) => {
        const top = stop(index) + ISLAND / 2 - 2
        const bottom = stop(index + 1) - ISLAND / 2 + 2
        const kind = state === true ? 'good' : state === false ? 'bad' : 'open'
        const x = MID - LAND_W / 2
        if (kind === 'open') {
          return <rect key={index} className="track__plot" x={x + 1} y={top + 3} width={LAND_W - 2} height={bottom - top - 6} />
        }
        if (kind === 'bad') {
          const stub = Math.round((bottom - top) * 0.3)
          return (
            <g key={index} className="track__span track__span--bad">
              <LandStrip x={x} y={top} width={LAND_W} height={stub} crumbled="bottom" />
              <LandStrip x={x} y={bottom - stub} width={LAND_W} height={stub} crumbled="top" />
              <path className="track__break" d={`M${MID - 5} ${(top + bottom) / 2 - 5}h2v2h2v2h2v-2h2v-2h2v2h-2v2h-2v2h2v2h2v2h-2v-2h-2v-2h-2v2h-2v2h-2v-2h2v-2h2v-2h-2v-2h-2z`} />
            </g>
          )
        }
        return (
          <g key={index} className="track__span track__span--good" style={{ '--i': index } as CSSProperties}>
            <LandStrip x={x} y={top} width={LAND_W} height={bottom - top} />
          </g>
        )
      })}

      {islands}

      <g className={runnerClass} style={runnerStyle}>
        <g className="track__hop">
          <Dino pose={pose} width={DINO_W} height={DINO_H} />
        </g>
      </g>
    </svg>
  )
}

/** A word's island: sand ring around grass, with a checkered flag on the goal. */
function Island({ y, goal }: { y: number; goal: boolean }) {
  const x = 0
  return (
    <g className="track__island">
      <path className="track__shore" d={`M${x + 4} ${y}h${WIDTH - 8}v2h2v2h2v${ISLAND - 8}h-2v2h-2v2h${-(WIDTH - 8)}v-2h-2v-2h-2v${-(ISLAND - 8)}h2v-2h2z`} />
      <path className="track__sand" d={`M${x + 6} ${y + 2}h${WIDTH - 12}v2h2v2h2v${ISLAND - 12}h-2v2h-2v2h${-(WIDTH - 12)}v-2h-2v-2h-2v${-(ISLAND - 12)}h2v-2h2z`} />
      <rect className="track__grass" x={x + 8} y={y + 6} width={WIDTH - 16} height={ISLAND - 12} />
      <rect className="track__tuft" x={x + 12} y={y + 10} width="4" height="2" />
      <rect className="track__tuft" x={x + 28} y={y + 24} width="4" height="2" />
      {goal && (
        <g className="track__flag">
          <rect x={WIDTH - 12} y={y + 2} width="2" height="22" className="track__pole" />
          <path className="track__flag-a" d={`M${WIDTH - 10} ${y + 2}h8v6h-8z`} />
          <path className="track__flag-b" d={`M${WIDTH - 10} ${y + 2}h2v2h-2zM${WIDTH - 6} ${y + 2}h2v2h-2zM${WIDTH - 8} ${y + 4}h2v2h-2zM${WIDTH - 4} ${y + 4}h2v2h-2zM${WIDTH - 10} ${y + 6}h2v2h-2zM${WIDTH - 6} ${y + 6}h2v2h-2z`} />
        </g>
      )}
    </g>
  )
}

/** Land between islands, from above: grass down the middle and checkered earth banks. */
function LandStrip({ x, y, width, height, crumbled }: { x: number; y: number; width: number; height: number; crumbled?: 'top' | 'bottom' }) {
  const tufts: ReactNode[] = []
  for (let ty = y + 6; ty < y + height - 6; ty += 12) tufts.push(<rect key={ty} className="track__tuft" x={x + (ty % 24 < 12 ? 8 : 14)} y={ty} width="4" height="2" />)
  const bank = (bx: number) => {
    const squares: ReactNode[] = []
    for (let by = y; by < y + height; by += 4) squares.push(<rect key={by} className="track__earth-b" x={bx + ((by - y) % 8 === 0 ? 0 : 2)} y={by} width="2" height={Math.min(2, y + height - by)} />)
    return squares
  }
  return (
    <g>
      <rect className="track__edge" x={x} y={y} width={width} height={height} />
      <rect className="track__earth-a" x={x + 2} y={y} width="4" height={height} />
      <rect className="track__earth-a" x={x + width - 6} y={y} width="4" height={height} />
      {bank(x + 2)}
      {bank(x + width - 6)}
      <rect className="track__grass" x={x + 6} y={y} width={width - 12} height={height} />
      {tufts}
      {crumbled && (
        <path
          className="track__crumble"
          d={crumbled === 'bottom'
            ? `M${x} ${y + height - 4}h4v2h4v2h-8zM${x + 12} ${y + height - 2}h6v2h-6zM${x + width - 6} ${y + height - 4}h6v4h-6z`
            : `M${x} ${y}h6v4h-6zM${x + 10} ${y}h6v2h-6zM${x + width - 8} ${y}h8v2h-4v2h-4z`}
        />
      )}
    </g>
  )
}

function foam(height: number): string {
  let d = ''
  for (let y = 30; y < height - 20; y += 22) d += `M4 ${y}h4v2h-4z M${WIDTH - 8} ${y + 11}h4v2h-4z `
  return d
}
