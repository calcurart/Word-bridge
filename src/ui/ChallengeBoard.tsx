import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CHALLENGE_SECONDS, formatClock, rarity, SKIP_PENALTY_SECONDS } from '../lib/challenge.ts'
import type { ChallengeMode } from '../lib/challenge.ts'
import { answerChallenge, finishChallenge, ONLINE, skipChallenge, startChallenge } from '../lib/online.ts'
import type { AnswerOutcome, AnswerResult, ChallengeResult } from '../lib/online.ts'
import { RefreshIcon, TimerIcon, TrophyIcon } from './icons.tsx'

type Props = {
  playerId: string
  playerName: string | null
  bests: Record<ChallengeMode, number>
  onBest: (mode: ChallengeMode, score: number) => void
  onAnnounce: (text: string) => void
  onLeaderboard: () => void
}

type Running = { mode: ChallengeMode; run: string; prompt: string; endsAt: number; score: number; made: AnswerResult[][] }
type Phase =
  | { kind: 'choose'; error?: string }
  | { kind: 'starting'; mode: ChallengeMode }
  | { kind: 'running'; game: Running }
  | { kind: 'over'; mode: ChallengeMode; score: number; made: AnswerResult[][]; result: ChallengeResult | 'pending'; newBest: boolean }

type Feedback = { ok: true; results: AnswerResult[]; gained: number; key: number } | { ok: false; text: string; key: number }

const MODES: Record<ChallengeMode, { title: string; blurb: string; example: string }> = {
  single: {
    title: 'Single',
    blurb: 'Type one word that comes after the prompt.',
    example: 'FOREST → FIRE (forest fire)',
  },
  double: {
    title: 'Double',
    blurb: 'Type two words: one that goes before the prompt and one after it.',
    example: 'RAIN + FOREST + FIRE (rainforest, forest fire)',
  },
}

const REASONS: Record<Extract<AnswerOutcome, { ok: false }>['reason'], string> = {
  missing: 'Type a word in each box.',
  'not-one-word': 'One word per box, letters only.',
  same: 'That’s the prompt word itself.',
  used: 'Already used in this run. Try another word.',
  'same-pair': 'Use two different words.',
  unknown: 'Not a word or phrase we can find (Wiktionary or Urban Dictionary).',
  time: 'Time’s up!',
  error: 'Couldn’t reach the server. Try again.',
}

export function ChallengeBoard({ playerId, playerName, bests, onBest, onAnnounce, onLeaderboard }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' })
  const [now, setNow] = useState(() => Date.now())
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const beforeInput = useRef<HTMLInputElement>(null)
  const afterInput = useRef<HTMLInputElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const warned = useRef(new Set<number>())
  const finishing = useRef<string | null>(null)

  const game = phase.kind === 'running' ? phase.game : null
  const remaining = game ? Math.max(0, game.endsAt - now) : 0

  useEffect(() => {
    if (!game) return
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [game])

  useEffect(() => {
    if (!game) return
    const seconds = Math.ceil(remaining / 1000)
    for (const mark of [60, 10]) {
      if (seconds <= mark && seconds > 0 && !warned.current.has(mark)) {
        warned.current.add(mark)
        onAnnounce(mark === 60 ? 'One minute left.' : 'Ten seconds left.')
      }
    }
    if (remaining <= 0 && !busy) void finish(game)
  })

  const focusFirst = (_mode: ChallengeMode) => undefined
  useEffect(() => {
    if (!game) return
    ;(game.mode === 'double' ? beforeInput : afterInput).current?.focus()
  }, [game?.run, game?.prompt])

  async function start(mode: ChallengeMode) {
    if (!playerId) return
    setPhase({ kind: 'starting', mode })
    const started = await startChallenge(playerId, mode, playerName ?? undefined)
    if (!started) {
      setPhase({ kind: 'choose', error: 'Couldn’t start a challenge. Check your connection and try again.' })
      return
    }
    warned.current = new Set()
    finishing.current = null
    setBefore('')
    setAfter('')
    setFeedback(null)
    setNow(Date.now())
    setPhase({ kind: 'running', game: { mode, run: started.run, prompt: started.prompt, endsAt: Date.now() + started.endsIn, score: 0, made: [] } })
    onAnnounce(`Go! Your first word is ${started.prompt.toUpperCase()}.`)
    focusFirst(mode)
  }

  async function finish(current: Running) {
    if (finishing.current === current.run) return
    finishing.current = current.run
    const newBest = current.score > bests[current.mode]
    if (newBest) onBest(current.mode, current.score)
    setPhase({ kind: 'over', mode: current.mode, score: current.score, made: current.made, result: 'pending', newBest })
    onAnnounce(`Time’s up! You scored ${current.score} points.`)
    window.setTimeout(() => heading.current?.focus(), 0)
    const result = await finishChallenge(playerId, current.run)
    setPhase(state => (state.kind === 'over' && state.made === current.made ? { ...state, result } : state))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!game || busy) return
    if (game.mode === 'double' && before.trim() === '') { beforeInput.current?.focus(); return }
    if (after.trim() === '') { afterInput.current?.focus(); return }
    setBusy(true)
    const outcome = await answerChallenge(playerId, game.run, game.mode === 'double' ? { before, after } : { after })
    setBusy(false)
    if (!outcome.ok) {
      if (outcome.reason === 'time') { void finish(game); return }
      setFeedback({ ok: false, text: REASONS[outcome.reason], key: Date.now() })
      const target = outcome.slot === 'before' ? beforeInput : afterInput
      target.current?.select()
      target.current?.focus()
      if (outcome.endsIn !== undefined) setPhase({ kind: 'running', game: { ...game, endsAt: Date.now() + outcome.endsIn } })
      return
    }
    const next: Running = { ...game, prompt: outcome.prompt, score: outcome.score, endsAt: Date.now() + outcome.endsIn, made: [...game.made, outcome.results] }
    setPhase({ kind: 'running', game: next })
    setBefore('')
    setAfter('')
    setFeedback({ ok: true, results: outcome.results, gained: outcome.gained, key: Date.now() })
    onAnnounce(`${outcome.results.map(item => `${item.phrase}, ${item.points} points`).join('; ')}. Next word: ${outcome.prompt.toUpperCase()}.`)
    focusFirst(game.mode)
  }

  async function skip() {
    if (!game || busy) return
    setBusy(true)
    const skipped = await skipChallenge(playerId, game.run)
    setBusy(false)
    if (!skipped) return
    setPhase({ kind: 'running', game: { ...game, prompt: skipped.prompt, endsAt: Date.now() + skipped.endsIn } })
    setBefore('')
    setAfter('')
    setFeedback({ ok: false, text: `Skipped (−${SKIP_PENALTY_SECONDS} seconds).`, key: Date.now() })
    onAnnounce(`Skipped. New word: ${skipped.prompt.toUpperCase()}.`)
    focusFirst(game.mode)
  }

  if (!ONLINE) {
    return <section className="challenge"><p className="challenge__intro">Challenge mode needs the online word service, which isn’t set up for this copy of the game.</p></section>
  }

  if (phase.kind === 'choose' || phase.kind === 'starting') {
    return (
      <section className="challenge" aria-labelledby="challenge-title">
        <div className="challenge__intro">
          <TimerIcon className="challenge__badge" width="34" height="34" />
          <h2 id="challenge-title" className="challenge__title">Five-minute challenge</h2>
          <p>
            Make as many words and phrases as you can with the prompt word, joined (<em>sunflower</em>) or spaced
            (<em>forest fire</em>). Rare answers score more: <strong>10</strong> for the obvious one, up to <strong>100</strong> for
            something nobody else thinks of.
          </p>
          <div className="challenge__modes">
            {(['single', 'double'] as const).map(mode => (
              <div key={mode} className="challenge__mode">
                <h3>{MODES[mode].title}</h3>
                <p>{MODES[mode].blurb}</p>
                <p className="challenge__example">{MODES[mode].example}</p>
                {bests[mode] > 0 && <p className="challenge__best">Your best: <strong>{bests[mode]}</strong></p>}
                <button
                  type="button" className="btn btn--primary" onClick={() => void start(mode)}
                  disabled={phase.kind === 'starting' || !playerId}
                >
                  {phase.kind === 'starting' && phase.mode === mode ? 'Starting…' : `Play ${MODES[mode].title}`}
                </button>
              </div>
            ))}
          </div>
          <ul className="challenge__rules">
            <li>Each word can be used once per run. Stuck? Skip for {SKIP_PENALTY_SECONDS} seconds.</li>
            <li>Words are checked against Wiktionary, plus Urban Dictionary for newer slang.</li>
            <li>Rarity comes from how common a phrase is and how few other players give it.</li>
          </ul>
          {phase.kind === 'choose' && phase.error && <p className="challenge__error" role="alert">{phase.error}</p>}
        </div>
      </section>
    )
  }

  if (phase.kind === 'over') {
    const result = phase.result
    return (
      <section className="challenge result" aria-labelledby="challenge-over">
        <h2 id="challenge-over" className="result__title" tabIndex={-1} ref={heading}>Time’s up!</h2>
        <p className="challenge__score-big">{phase.score}</p>
        <p className="result__summary">
          points · {MODES[phase.mode].title}{phase.newBest ? ' · new personal best!' : bests[phase.mode] > 0 ? ` · best ${bests[phase.mode]}` : ''}
        </p>
        <p className="challenge__rank" role="status">
          {result === 'pending' && 'Sending your score…'}
          {result !== 'pending' && result.status === 'scored' && `#${result.rankToday} today · #${result.rankAllTime} all time (${MODES[phase.mode].title})`}
          {result !== 'pending' && result.status !== 'scored' && 'This score couldn’t be added to the leaderboard.'}
        </p>
        {phase.made.length > 0 && <Made made={phase.made} />}
        <div className="result__actions">
          <button type="button" className="btn btn--primary" onClick={() => void start(phase.mode)}><RefreshIcon /> Play again</button>
          <button type="button" className="btn btn--quiet" onClick={onLeaderboard}><TrophyIcon /> Leaderboard</button>
        </div>
        <button type="button" className="link-button challenge__switch" onClick={() => setPhase({ kind: 'choose' })}>
          Switch to {phase.mode === 'single' ? 'Double' : 'Single'}
        </button>
      </section>
    )
  }

  const current = phase.game
  const prompt = current.prompt.toUpperCase()
  return (
    <section className="challenge" aria-label={`${MODES[current.mode].title} challenge in progress`}>
      <div className="challenge__bar">
        <span className={`challenge__clock${remaining < 30_000 ? ' challenge__clock--low' : ''}`} aria-label={`${formatClock(remaining)} left`}>
          <TimerIcon width="18" height="18" /> {formatClock(remaining)}
        </span>
        <span className="challenge__mode-tag">{MODES[current.mode].title}</span>
        <span className="challenge__score" aria-label={`Score ${current.score}`}>{current.score} <small>pts</small></span>
      </div>
      <div className="challenge__time" aria-hidden="true"><span style={{ width: `${(remaining / (CHALLENGE_SECONDS * 1000)) * 100}%` }} /></div>

      <form className={`challenge__play challenge__play--${current.mode}`} onSubmit={submit} noValidate>
        {current.mode === 'double' && (
          <>
            <label className="sr-only" htmlFor="challenge-before">Word that goes before {prompt}</label>
            <input
              ref={beforeInput} id="challenge-before" className="challenge__input" value={before} placeholder={`___ ${current.prompt}`}
              onChange={event => setBefore(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && after.trim() === '') { event.preventDefault(); afterInput.current?.focus() }
              }}
              autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="next" maxLength={30}
            />
          </>
        )}
        <span key={current.prompt} className="challenge__word">{prompt}</span>
        <label className="sr-only" htmlFor="challenge-after">Word that goes after {prompt}</label>
        <input
          ref={afterInput} id="challenge-after" className="challenge__input" value={after} placeholder={`${current.prompt} ___`}
          onChange={event => setAfter(event.target.value)}
          autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="go" maxLength={30}
        />
        <button type="submit" className="btn btn--primary challenge__go" disabled={busy}>{busy ? 'Checking…' : 'Go'}</button>
      </form>

      <div key={feedback?.key} className={`challenge__feedback${feedback ? (feedback.ok ? ' challenge__feedback--good' : ' challenge__feedback--bad') : ''}`} role="status">
        {feedback?.ok && (
          <>
            {feedback.results.map(item => <Points key={item.slot} item={item} />)}
            {feedback.results.length > 1 && <strong className="challenge__gained">+{feedback.gained}</strong>}
          </>
        )}
        {feedback && !feedback.ok && feedback.text}
        {!feedback && ' '}
      </div>

      <div className="challenge__actions">
        <button type="button" className="btn btn--quiet btn--small" onClick={() => void skip()} disabled={busy}>Skip word (−{SKIP_PENALTY_SECONDS}s)</button>
        <button type="button" className="link-button" onClick={() => void finish(current)}>End run</button>
      </div>

      {current.made.length > 0 && <Made made={current.made.slice(-5).reverse()} live />}
    </section>
  )
}

function Points({ item }: { item: AnswerResult }) {
  const level = rarity(item.points)
  return (
    <span className={`points points--${level.tier}`}>
      <span className="points__phrase">{item.phrase}</span>
      <span className="points__value">+{item.points}</span>
      <span className="points__label">{level.label}{item.source === 'urban' ? ' · slang' : ''}</span>
    </span>
  )
}

function Made({ made, live = false }: { made: AnswerResult[][]; live?: boolean }) {
  return (
    <ul className={`challenge__made${live ? ' challenge__made--live' : ''}`} aria-label="Your words">
      {made.flat().map((item, index) => (
        <li key={`${item.phrase}-${index}`} className={`points--${rarity(item.points).tier}`}>
          {item.phrase} <strong>{item.points}</strong>
        </li>
      ))}
    </ul>
  )
}
