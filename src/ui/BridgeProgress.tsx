import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { carProgress } from '../lib/game.ts'
import type { LinkFeedback } from '../lib/game.ts'

// Scene geometry, in SVG user units. Posts sit between the banks; the car stops at posts.
const WIDTH = 360
const HEIGHT = 100
const LEFT = 30
const RIGHT = 330
const DECK = 62
const CAR_SCALE = 1.45
const CAR_HALF = 15 * CAR_SCALE
const TOP = 10
const STEP_SECONDS = 0.45

type Props = {
  feedback: readonly LinkFeedback[]
  won: boolean
}

/**
 * A little bridge above the puzzle. The car drives forward over each recognized link, counting
 * from the start word. It stops in front of an unrecognized link, and rolls back as soon as a
 * change makes a crossed link unchecked or wrong. Purely visual: the caption says the same in words.
 */
export function BridgeProgress({ feedback, won }: Props) {
  const links = feedback.length
  const progress = carProgress(feedback)
  const blocked = progress < links && feedback[progress] === false
  const posts = Array.from({ length: links + 1 }, (_, index) => LEFT + (index * (RIGHT - LEFT)) / links)

  // Remember where the car was, so the move can be animated over the right distance and direction.
  const previous = useRef(progress)
  const [motion, setMotion] = useState<{ direction: 'forward' | 'back'; steps: number } | null>(null)
  useEffect(() => {
    const steps = progress - previous.current
    previous.current = progress
    if (steps === 0) return
    setMotion({ direction: steps > 0 ? 'forward' : 'back', steps: Math.abs(steps) })
    const timer = window.setTimeout(() => setMotion(null), Math.abs(steps) * STEP_SECONDS * 1000 + 50)
    return () => window.clearTimeout(timer)
  }, [progress])

  const travel = (motion?.steps ?? 1) * STEP_SECONDS
  const carStyle = {
    transform: `translateX(${posts[progress] - CAR_HALF}px)`,
    '--travel': `${travel}s`,
  } as CSSProperties

  const caption = won
    ? 'Made it across!'
    : blocked
      ? `Stopped at link ${progress + 1}: it isn’t in this game’s dictionary.`
      : progress === 0
        ? 'Check your bridge to start the car.'
        : `Crossed ${progress} of ${links} links.`

  return (
    <figure className={`scene${won ? ' scene--won' : ''}`}>
      <svg className="scene__svg" viewBox={`0 ${TOP} ${WIDTH} ${HEIGHT - TOP}`} aria-hidden="true" focusable="false">
        <path className="scene__water" d={wave()} />

        <rect className="scene__bank" x="0" y={DECK} width={LEFT} height={HEIGHT - DECK} rx="3" />
        <rect className="scene__bank" x={RIGHT} y={DECK} width={WIDTH - RIGHT} height={HEIGHT - DECK} rx="3" />

        {posts.slice(0, -1).map((x, index) => {
          const next = posts[index + 1]
          const state = feedback[index]
          const kind = state === true ? 'good' : state === false ? 'bad' : 'open'
          const length = next - x
          return (
            <g key={index} className={`scene__span scene__span--${kind}`} style={{ '--i': index } as CSSProperties}>
              <path className="scene__cable" d={`M ${x} ${DECK - 30} Q ${(x + next) / 2} ${DECK - 8} ${next} ${DECK - 30}`} />
              {kind === 'bad' ? (
                <>
                  <line className="scene__deck" x1={x} y1={DECK} x2={x + length * 0.34} y2={DECK + 3} />
                  <line className="scene__deck" x1={next - length * 0.34} y1={DECK + 3} x2={next} y2={DECK} />
                  <path className="scene__break" d={`M ${x + length / 2 - 5} ${DECK - 13} l 10 10 m 0 -10 l -10 10`} />
                </>
              ) : (
                <line className="scene__deck" x1={x} y1={DECK} x2={next} y2={DECK} />
              )}
            </g>
          )
        })}

        {posts.slice(1, -1).map((x, index) => (
          <rect key={index} className="scene__tower" x={x - 2.5} y={DECK - 32} width="5" height={HEIGHT - DECK + 32} rx="2" />
        ))}

        <g className="scene__flag" transform={`translate(${WIDTH - 6} ${DECK - 50})`}>
          <line x1="0" y1="0" x2="0" y2="50" />
          <path d="M 0 1 L -14 6 L 0 11 Z" />
        </g>

        <g
          className={`scene__car${motion ? ` scene__car--${motion.direction}` : ''}${blocked && !motion ? ' scene__car--stuck' : ''}`}
          style={carStyle}
        >
          <g transform={`translate(0 ${DECK - 2.5 - 60 * CAR_SCALE}) scale(${CAR_SCALE})`}>
          <g className="scene__car-body">
            <path className="scene__paint" d="M 2 55 L 2 49 Q 2 46 5 46 L 8 46 L 12 40 Q 13 39 15 39 L 21 39 Q 23 39 24 41 L 26 46 Q 28 46.5 28 49 L 28 55 Z" />
            <path className="scene__glass" d="M 13.5 41 L 15 41 L 15 46 L 10.5 46 Z M 17 41 L 21.5 41 L 23.5 46 L 17 46 Z" />
            <rect className="scene__light" x="25.5" y="48" width="2.5" height="2" rx="0.6" />
          </g>
          <g transform="translate(8 56)"><g className="scene__wheel"><circle r="4" /><path d="M -2.5 0 H 2.5 M 0 -2.5 V 2.5" /></g></g>
          <g transform="translate(22 56)"><g className="scene__wheel"><circle r="4" /><path d="M -2.5 0 H 2.5 M 0 -2.5 V 2.5" /></g></g>
          </g>
        </g>
      </svg>
      <figcaption className="scene__caption">{caption}</figcaption>
    </figure>
  )
}

function wave(): string {
  let d = `M 0 ${HEIGHT - 12}`
  for (let x = 0; x < WIDTH; x += 30) d += ` q 7.5 -4 15 0 t 15 0`
  return `${d} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`
}
