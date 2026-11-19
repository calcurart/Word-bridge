import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { carProgress } from '../lib/game.ts'
import type { LinkFeedback } from '../lib/game.ts'

// These match the fixed heights of a word tile and a link in styles.css (.tile, .link), so each stop
// on the track lines up with the middle of its word.
const TILE = 60
const LINK = 58
const STEP = TILE + LINK
const WIDTH = 36
const MID = WIDTH / 2
const CAR_W = 20
const CAR_H = 32
const STEP_SECONDS = 0.5

type Props = {
  feedback: readonly LinkFeedback[]
  won: boolean
}

/**
 * A bridge seen from above, running down the side of the word tiles. The car drives down over each
 * recognized link from the start word, stops in front of an unrecognized one, and backs up as soon as
 * a change makes a crossed link unchecked or wrong. Decorative: the links already say the same in text.
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

  const carStyle = {
    transform: `translate(${MID - CAR_W / 2}px, ${stop(progress) - CAR_H / 2}px)`,
    '--travel': `${(motion?.steps ?? 1) * STEP_SECONDS}s`,
  } as CSSProperties
  const carClass = ['track__car', motion && `track__car--${motion.direction}`, blocked && !motion && 'track__car--stuck']
    .filter(Boolean).join(' ')

  return (
    <svg
      className={`track${won ? ' track--won' : ''}`} width={WIDTH} height={height}
      viewBox={`0 0 ${WIDTH} ${height}`} aria-hidden="true" focusable="false"
    >
      <rect className="track__water" x="2" y="0" width={WIDTH - 4} height={height} rx="10" />
      <path className="track__ripples" d={ripples(height)} />
      <rect className="track__bank" x="0" y="0" width={WIDTH} height={TILE * 0.8} rx="9" />
      <rect className="track__bank" x="0" y={height - TILE * 0.8} width={WIDTH} height={TILE * 0.8} rx="9" />
      <path className="track__finish" d={finishLine(height - TILE * 0.8 + 2)} />

      {feedback.map((state, index) => {
        const top = stop(index)
        const bottom = stop(index + 1)
        const kind = state === true ? 'good' : state === false ? 'bad' : 'open'
        const third = (bottom - top) * 0.34
        const pieces = kind === 'bad' ? [[top, top + third], [bottom - third, bottom]] : [[top, bottom]]
        return (
          <g key={index} className={`track__span track__span--${kind}`} style={{ '--i': index } as CSSProperties}>
            {pieces.map(([y1, y2], piece) => (
              <g key={piece}>
                <line className="track__planks" x1={MID} y1={y1} x2={MID} y2={y2} />
                <line className="track__rail" x1={MID - 10.5} y1={y1} x2={MID - 10.5} y2={y2} />
                <line className="track__rail" x1={MID + 10.5} y1={y1} x2={MID + 10.5} y2={y2} />
              </g>
            ))}
            {kind === 'bad' && (
              <path className="track__break" d={`M ${MID - 5} ${(top + bottom) / 2 - 5} l 10 10 m 0 -10 l -10 10`} />
            )}
          </g>
        )
      })}

      {/* The car points down the bridge, front at the bottom. */}
      <g className={carClass} style={carStyle}>
        <g className="track__car-body">
          <rect className="track__tyre" x="-1.5" y="5" width="4" height="7" rx="1.5" />
          <rect className="track__tyre" x={CAR_W - 2.5} y="5" width="4" height="7" rx="1.5" />
          <rect className="track__tyre" x="-1.5" y="21" width="4" height="7" rx="1.5" />
          <rect className="track__tyre" x={CAR_W - 2.5} y="21" width="4" height="7" rx="1.5" />
          <rect className="track__paint" x="0" y="0" width={CAR_W} height={CAR_H} rx="6" />
          <rect className="track__glass" x="3.5" y="4" width={CAR_W - 7} height="5" rx="2" />
          <rect className="track__roof" x="3.5" y="10.5" width={CAR_W - 7} height="10" rx="2" />
          <rect className="track__glass" x="3" y="22" width={CAR_W - 6} height="6" rx="2" />
          <rect className="track__lamp" x="3" y={CAR_H - 2.2} width="4" height="2" rx="1" />
          <rect className="track__lamp" x={CAR_W - 7} y={CAR_H - 2.2} width="4" height="2" rx="1" />
        </g>
      </g>
    </svg>
  )
}

function ripples(height: number): string {
  let d = ''
  for (let y = 40; y < height - 40; y += 26) d += `M 6 ${y} q 3 -2 6 0 M ${WIDTH - 12} ${y + 13} q 3 -2 6 0 `
  return d
}

/** A checkered strip where the bridge meets the far bank. */
function finishLine(y: number): string {
  let d = ''
  for (let x = 0; x < WIDTH; x += 6) d += `M ${x} ${y + ((x / 6) % 2) * 3} h 3 v 3 h -3 Z `
  return d
}
