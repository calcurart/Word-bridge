import { useEffect, useId, useState } from 'react'
import type { CSSProperties } from 'react'
import { routeShare, sameRoute, yourRouteVerdict } from '../lib/crossings.ts'
import type { Crossings as CrossingsData } from '../lib/crossings.ts'
import { fetchCrossings } from '../lib/online.ts'

type Props = {
  playerId: string
  day: number
  /** The winning gap words, or null after a loss. */
  bridge: readonly string[] | null
  /** True once the server has counted this game, so it will answer. */
  ready: boolean
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
const upper = (word: string) => word.toUpperCase()

/** "How others crossed": the most taken routes across today's daily, shown only after finishing it. */
export function Crossings({ playerId, day, bridge, ready }: Props) {
  const [data, setData] = useState<CrossingsData | null | 'loading'>('loading')
  const ids = useId()
  const bridgeKey = bridge?.join(' ') ?? ''

  useEffect(() => {
    if (!ready || !playerId) return
    let active = true
    setData('loading')
    fetchCrossings(playerId, day, bridgeKey ? bridgeKey.split(' ') : null).then(result => { if (active) setData(result) })
    return () => { active = false }
  }, [ready, playerId, day, bridgeKey])

  // Offline or the service didn't answer: leave the result card as it was.
  if (data === null) return null

  const loading = data === 'loading'
  const verdict = loading ? null : yourRouteVerdict(data)
  const yoursListed = !loading && data.yours !== null && data.routes.some(route => sameRoute(route.words, data.yours!.words))

  return (
    <section className="crossings" aria-labelledby={`${ids}-title`} aria-busy={loading}>
      <h3 id={`${ids}-title`} className="result__label crossings__title">How others crossed</h3>
      {loading ? (
        <p className="crossings__summary" role="status">Counting the crossings…</p>
      ) : (
        <>
          {verdict && <p className={`crossings__verdict crossings__verdict--${verdict.tone}`}>{verdict.text}</p>}
          <p className="crossings__summary">
            {data.solvers === 0
              ? 'Nobody has crossed this bridge yet.'
              : `${plural(data.solvers, 'builder')} crossed by ${plural(data.distinct, 'different route')}.`}
          </p>
          {data.routes.length > 0 && (
            <ol className="crossings__list" aria-label="Most taken routes">
              {data.routes.map((route, index) => {
                const mine = data.yours !== null && sameRoute(route.words, data.yours.words)
                return <RouteRow key={route.words.join(' ')} words={route.words} share={routeShare(route.count, data.solvers)}
                  fill={route.count / data.solvers} mine={mine} index={index} />
              })}
            </ol>
          )}
          {data.yours && !yoursListed && (
            <ol className="crossings__list crossings__list--yours" aria-label="Your route">
              <RouteRow words={data.yours.words} share={routeShare(data.yours.count, data.solvers)}
                fill={data.yours.count / data.solvers} mine index={data.routes.length} />
            </ol>
          )}
        </>
      )}
    </section>
  )
}

function RouteRow({ words, share, fill, mine, index }: { words: readonly string[]; share: string; fill: number; mine: boolean; index: number }) {
  return (
    <li className={`crossings__route${mine ? ' crossings__route--yours' : ''}`} style={{ '--fill': fill, '--i': index } as CSSProperties}>
      <span className="crossings__bar" aria-hidden="true" />
      <span className="crossings__words">
        {words.map(upper).join(' → ')}
        {mine && <span className="crossings__tag">You</span>}
      </span>
      <span className="crossings__share">{share}</span>
    </li>
  )
}
