import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { rarity, ROUND_SECONDS, ROUNDS } from '../lib/challenge.ts'
import type { ChallengeMode } from '../lib/challenge.ts'
import { answerChallenge, finishChallenge, ONLINE, skipChallenge, startChallenge } from '../lib/online.ts'
import type { AnswerReason, AnswerResult, ChallengeResult, RoundState } from '../lib/online.ts'
import { RefreshIcon, TimerIcon, TrophyIcon } from './icons.tsx'
import { LandBridge } from './LandBridge.tsx'

type Props = {
  playerId: string
  playerName: string | null
  bests: Record<ChallengeMode, number>
  onBest: (mode: ChallengeMode, score: number) => void
  onAnnounce: (text: string) => void
  onLeaderboard: () => void
}

type Running = {
  mode: ChallengeMode; run: string; prompt: string; round: number; rounds: number
  /** When this prompt's time runs out (local clock). */
  endsAt: number
  score: number
  made: AnswerResult[][]
}
type Phase =
  | { kind: 'choose'; error?: string }
  | { kind: 'starting'; mode: ChallengeMode }
  | { kind: 'running'; game: Running }
  | { kind: 'over'; mode: ChallengeMode; run: string; score: number; made: AnswerResult[][]; result: ChallengeResult | 'pending'; newBest: boolean }

type Feedback = { ok: true; results: AnswerResult[]; gained: number; key: number } | { ok: false; text: string; key: number }

const ROUND_MS = ROUND_SECONDS * 1000

const MODES: Record<ChallengeMode, { title: string; blurb: string; example: string }> = {
  single: { title: 'Single', blurb: 'Type one word that comes after the prompt.', example: 'FOREST → FIRE (forest fire)' },
  double: {
    title: 'Double',
    blurb: 'Type two words: one that goes before the prompt and one after it.',
    example: 'RAIN + FOREST + FIRE (rainforest, forest fire)',
  },
}

const REASONS: Record<AnswerReason, string> = {
  missing: 'Type a word in each box.',
  'not-one-word': 'One word per box, letters only.',
  'not-a-word': 'That isn’t a word on its own. Single letters and word endings don’t count.',
  same: 'That’s the prompt word itself.',
  used: 'Already used in this run. Try another word.',
  'same-pair': 'Use two different words.',
  unknown: 'Not a word or phrase we can find (Wiktionary or Urban Dictionary).',
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
  const ending = useRef<string | null>(null)
  const timingOut = useRef<string | null>(null)

  const game = phase.kind === 'running' ? phase.game : null
  const remaining = game ? Math.max(0, game.endsAt - now) : 0

  useEffect(() => {
    if (!game) return
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [game])

  // Put the cursor in the first box whenever a new prompt appears.
  useEffect(() => {
    if (!game) return
    ;(game.mode === 'double' ? beforeInput : afterInput).current?.focus()
  }, [game?.run, game?.prompt, game?.round])

  // The bar ran out: move on to the next prompt automatically.
  useEffect(() => {
    if (!game || busy || remaining > 0) return
    const key = `${game.run}:${game.round}`
    if (timingOut.current === key) return
    timingOut.current = key
    void (async () => {
      setBusy(true)
      const next = await skipChallenge(playerId, game.run)
      setBusy(false)
      if (!next) { void end(game, game.score); return }
      setFeedback({ ok: false, text: 'Time’s up! Next word.', key: Date.now() })
      apply(game, next, null)
    })()
  })

  /** Shows the next prompt from the server, or the results when the run is over. */
  function apply(current: Running, next: RoundState, results: AnswerResult[] | null) {
    const made = results ? [...current.made, results] : current.made
    if (next.done) { void end({ ...current, made, score: next.score }, next.score); return }
    setBefore('')
    setAfter('')
    setNow(Date.now())
    setPhase({ kind: 'running', game: { ...current, made, prompt: next.prompt, round: next.round, score: next.score, endsAt: Date.now() + next.endsIn } })
    onAnnounce(`Word ${next.round} of ${current.rounds}: ${next.prompt.toUpperCase()}.`)
  }

  async function start(mode: ChallengeMode) {
    if (!playerId) return
    setPhase({ kind: 'starting', mode })
    const started = await startChallenge(playerId, mode, playerName ?? undefined)
    if (!started) {
      setPhase({ kind: 'choose', error: 'Couldn’t start a challenge. Check your connection and try again.' })
      return
    }
    ending.current = null
    timingOut.current = null
    setBefore('')
    setAfter('')
    setFeedback(null)
    setNow(Date.now())
    setPhase({
      kind: 'running',
      game: { mode, run: started.run, prompt: started.prompt, round: started.round, rounds: started.rounds, endsAt: Date.now() + started.endsIn, score: 0, made: [] },
    })
    onAnnounce(`Go! ${started.rounds} words, ${ROUND_SECONDS} seconds each. Your first word is ${started.prompt.toUpperCase()}.`)
  }

  async function end(current: Running, score: number) {
    if (ending.current === current.run) return
    ending.current = current.run
    const newBest = score > bests[current.mode]
    if (newBest) onBest(current.mode, score)
    setPhase({ kind: 'over', mode: current.mode, run: current.run, score, made: current.made, result: 'pending', newBest })
    onAnnounce(`Finished! You scored ${score} points.`)
    window.setTimeout(() => heading.current?.focus(), 0)
    const result = await finishChallenge(playerId, current.run)
    setPhase(state => (state.kind === 'over' && state.run === current.run ? { ...state, result } : state))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!game || busy) return
    if (game.mode === 'double' && before.trim() === '') { beforeInput.current?.focus(); return }
    if (after.trim() === '') { afterInput.current?.focus(); return }
    setBusy(true)
    const outcome = await answerChallenge(playerId, game.run, game.mode === 'double' ? { before, after } : { after })
    setBusy(false)
    if (outcome.ok) {
      setFeedback({ ok: true, results: outcome.results, gained: outcome.gained, key: Date.now() })
      onAnnounce(outcome.results.map(item => `${item.phrase}, ${item.points} points`).join('; '))
      apply(game, outcome, outcome.results)
      return
    }
    if (outcome.reason === 'time') {
      timingOut.current = `${game.run}:${game.round}`
      setFeedback({ ok: false, text: 'Too late for that word. Next word!', key: Date.now() })
      apply(game, outcome, null)
      return
    }
    setFeedback({ ok: false, text: REASONS[outcome.reason], key: Date.now() })
    const target = outcome.slot === 'before' ? beforeInput : afterInput
    target.current?.select()
    target.current?.focus()
  }

  async function skip() {
    if (!game || busy) return
    timingOut.current = `${game.run}:${game.round}`
    setBusy(true)
    const next = await skipChallenge(playerId, game.run)
    setBusy(false)
    if (!next) return
    setFeedback({ ok: false, text: 'Skipped.', key: Date.now() })
    apply(game, next, null)
  }

  if (!ONLINE) {
    return <section className="challenge"><p className="challenge__intro">Challenge mode needs the online word service, which isn’t set up for this copy of the game.</p></section>
  }

  if (phase.kind === 'choose' || phase.kind === 'starting') {
    return (
      <section className="challenge" aria-labelledby="challenge-title">
        <div className="challenge__intro">
          <TimerIcon className="challenge__badge" width="34" height="34" />
          <h2 id="challenge-title" className="challenge__title">Word challenge</h2>
          <p className="challenge__catch">How far can you go?</p>
          <p>
            {ROUNDS} prompt words, {ROUND_SECONDS} seconds each. Make a word or phrase with each one, joined
            (<em>sunflower</em>) or spaced (<em>forest fire</em>). Rare answers score more: <strong>10</strong> for the
            obvious one, up to <strong>100</strong> for something nobody else thinks of. Every word raises a piece of land bridge, and the rarer the word, the bigger the land.
          </p>
          <div className="challenge__modes">
            {(['single', 'double'] as const).map(mode => (
              <div key={mode} className="challenge__mode">
                <h3>{MODES[mode].title}</h3>
                <p>{MODES[mode].blurb}</p>
                <p className="challenge__example">{MODES[mode].example}</p>
                {bests[mode] > 0 && <p className="challenge__best">Your best: <strong>{bests[mode]}</strong></p>}
                <button type="button" className="btn btn--primary" onClick={() => void start(mode)} disabled={phase.kind === 'starting' || !playerId}>
                  {phase.kind === 'starting' && phase.mode === mode ? 'Starting…' : `Play ${MODES[mode].title}`}
                </button>
              </div>
            ))}
          </div>
          <ul className="challenge__rules">
            <li>Answers must be real words on their own: no single letters or word endings.</li>
            <li>When the bar runs out, the next word appears. Each word can be used once per run.</li>
            <li>Words are checked against Wiktionary, plus Urban Dictionary for newer slang.</li>
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
        <h2 id="challenge-over" className="result__title" tabIndex={-1} ref={heading}>Finished!</h2>
        <p className="challenge__score-big">{phase.score}</p>
        <LandBridge results={phase.made.flat()} />
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
  const fraction = remaining / ROUND_MS
  const level = fraction > 0.5 ? 'plenty' : fraction > 0.25 ? 'half' : 'low'
  return (
    <section className="challenge" aria-label={`${MODES[current.mode].title} challenge in progress`}>
      <div className="challenge__bar">
        <span className="challenge__round">Word <strong>{current.round}</strong> of {current.rounds}</span>
        <span className="challenge__mode-tag">{MODES[current.mode].title}</span>
        <span className="challenge__score" aria-label={`Score ${current.score}`}>{current.score} <small>pts</small></span>
      </div>
      <div
        className={`challenge__time challenge__time--${level}`} role="progressbar" aria-label="Time left for this word"
        aria-valuemin={0} aria-valuemax={ROUND_SECONDS} aria-valuenow={Math.ceil(remaining / 1000)}
        aria-valuetext={`${Math.ceil(remaining / 1000)} seconds left`}
      >
        <span style={{ width: `${fraction * 100}%` }} />
      </div>
      <LandBridge results={current.made.flat()} live />

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
        <span key={`${current.round}-${current.prompt}`} className="challenge__word">{prompt}</span>
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
        <button type="button" className="btn btn--quiet btn--small" onClick={() => void skip()} disabled={busy}>Skip word</button>
        <button type="button" className="link-button" onClick={() => void end(current, current.score)}>End run</button>
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
