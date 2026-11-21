import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  CHALLENGE_SECONDS, checkAnswer, formatClock, MAX_ANSWERS, nextPrompt, pickPrompt, SKIP_PENALTY_SECONDS,
} from '../lib/challenge.ts'
import type { WordGraph } from '../lib/graph.ts'
import { finishChallenge, ONLINE, startChallenge } from '../lib/online.ts'
import type { ChallengeResult } from '../lib/online.ts'
import { CheckIcon, CrossIcon, RefreshIcon, TimerIcon, TrophyIcon } from './icons.tsx'

type Props = {
  graph: WordGraph
  playerId: string
  playerName: string | null
  best: number
  onBest: (score: number) => void
  onAnnounce: (text: string) => void
  onLeaderboard: () => void
}

type Made = { prompt: string; answer: string; phrase: string }
type Feedback = { ok: boolean; text: string; key: number }

type Run = {
  endsAt: number
  prompt: string
  used: Set<string>
  made: Made[]
  /** Server run ID, requested when the run starts (null when offline). */
  ticket: Promise<string | null>
}

type Phase =
  | { kind: 'intro' }
  | { kind: 'running'; run: Run }
  | { kind: 'over'; made: Made[]; result: ChallengeResult | 'offline' | 'pending'; newBest: boolean }

const REASONS = {
  empty: 'Type a word first.',
  'not-one-word': 'One word, letters only.',
  same: 'That’s the same word.',
  used: 'Already used in this run. Try another word.',
  unknown: 'Not in this game’s dictionary.',
}

export function ChallengeBoard({ graph, playerId, playerName, best, onBest, onAnnounce, onLeaderboard }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' })
  const [now, setNow] = useState(() => Date.now())
  const [value, setValue] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const warned = useRef<Set<number>>(new Set())

  const running = phase.kind === 'running' ? phase.run : null
  const remaining = running ? Math.max(0, running.endsAt - now) : 0

  // Tick the clock while a run is going.
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [running])

  // Time warnings for screen reader users, and the end of the run.
  useEffect(() => {
    if (!running) return
    const seconds = Math.ceil(remaining / 1000)
    for (const mark of [60, 10]) {
      if (seconds <= mark && seconds > 0 && !warned.current.has(mark)) {
        warned.current.add(mark)
        onAnnounce(mark === 60 ? 'One minute left.' : 'Ten seconds left.')
      }
    }
    if (remaining <= 0) void finish(running)
  })

  function start() {
    const used = new Set<string>()
    const prompt = pickPrompt(graph, used)
    used.add(prompt)
    warned.current = new Set()
    const ticket = ONLINE && playerId ? startChallenge(playerId, playerName ?? undefined) : Promise.resolve(null)
    setNow(Date.now())
    setValue('')
    setFeedback(null)
    setPhase({ kind: 'running', run: { endsAt: Date.now() + CHALLENGE_SECONDS * 1000, prompt, used, made: [], ticket } })
    onAnnounce(`Go! Your first word is ${prompt.toUpperCase()}.`)
    window.setTimeout(() => input.current?.focus(), 0)
  }

  async function finish(run: Run) {
    if (phase.kind !== 'running' || phase.run !== run) return
    const score = run.made.length
    const newBest = score > best
    if (newBest) onBest(score)
    setPhase({ kind: 'over', made: run.made, result: 'pending', newBest })
    onAnnounce(`Time’s up! You made ${score} ${score === 1 ? 'connection' : 'connections'}.`)
    window.setTimeout(() => heading.current?.focus(), 0)
    const id = await run.ticket
    const result = id ? await finishChallenge(playerId, id, run.made.map(item => [item.prompt, item.answer] as const)) : 'offline'
    setPhase(current => (current.kind === 'over' && current.made === run.made ? { ...current, result } : current))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!running) return
    const check = checkAnswer(graph, running.prompt, value, running.used)
    if (!check.ok) {
      setFeedback({ ok: false, text: REASONS[check.reason], key: Date.now() })
      input.current?.select()
      return
    }
    const made = [...running.made, { prompt: running.prompt, answer: check.word, phrase: check.link.phrase }]
    const used = new Set(running.used).add(check.word)
    const prompt = nextPrompt(graph, check.word, used)
    used.add(prompt)
    setPhase({ kind: 'running', run: { ...running, prompt, used, made } })
    setValue('')
    setFeedback({ ok: true, text: check.link.phrase, key: Date.now() })
    onAnnounce(`${check.link.phrase}. ${made.length} points. Next word: ${prompt.toUpperCase()}.`)
    if (made.length >= MAX_ANSWERS) void finish({ ...running, made })
  }

  function skip() {
    if (!running) return
    const used = new Set(running.used)
    const prompt = pickPrompt(graph, used)
    used.add(prompt)
    setPhase({ kind: 'running', run: { ...running, prompt, used, endsAt: running.endsAt - SKIP_PENALTY_SECONDS * 1000 } })
    setValue('')
    setFeedback({ ok: false, text: `Skipped (−${SKIP_PENALTY_SECONDS} seconds).`, key: Date.now() })
    onAnnounce(`Skipped. New word: ${prompt.toUpperCase()}.`)
    input.current?.focus()
  }

  if (phase.kind === 'intro') {
    return (
      <section className="challenge" aria-labelledby="challenge-title">
        <div className="challenge__intro">
          <TimerIcon className="challenge__badge" width="34" height="34" />
          <h2 id="challenge-title" className="challenge__title">Five-minute challenge</h2>
          <p>
            You’ll get a word like <strong>FOREST</strong>. Type a word that makes a familiar word or phrase with it,
            before or after: <em>RAIN</em> (rainforest) or <em>FIRE</em> (forest fire). Each one scores a point, and your
            answer usually becomes the next word.
          </p>
          <ul className="challenge__rules">
            <li>Each word can be used once per run.</li>
            <li>Stuck? Skip to a new word for {SKIP_PENALTY_SECONDS} seconds.</li>
            <li>{ONLINE ? 'Scores go on the global leaderboard.' : 'Scores are kept on this device.'}</li>
          </ul>
          {best > 0 && <p className="challenge__best">Your best: <strong>{best}</strong></p>}
          <button type="button" className="btn btn--primary challenge__start" onClick={start}>Start the clock</button>
        </div>
      </section>
    )
  }

  if (phase.kind === 'over') {
    const score = phase.made.length
    const result = phase.result
    return (
      <section className="challenge result" aria-labelledby="challenge-over">
        <h2 id="challenge-over" className="result__title" tabIndex={-1} ref={heading}>Time’s up!</h2>
        <p className="challenge__score-big">{score}</p>
        <p className="result__summary">
          {score === 1 ? 'connection' : 'connections'}{phase.newBest ? ' · new personal best!' : best > 0 ? ` · best ${best}` : ''}
        </p>
        <p className="challenge__rank" role="status">
          {result === 'pending' && 'Sending your score…'}
          {result === 'offline' && 'Score kept on this device (the leaderboard couldn’t be reached).'}
          {typeof result === 'object' && result.status === 'scored' &&
            `#${result.rankToday} today · #${result.rankAllTime} all time on the leaderboard`}
          {typeof result === 'object' && result.status !== 'scored' && 'This score couldn’t be added to the leaderboard.'}
        </p>
        {phase.made.length > 0 && (
          <ul className="challenge__made" aria-label="Connections you made">
            {phase.made.map((item, index) => <li key={index}>{item.phrase}</li>)}
          </ul>
        )}
        <div className="result__actions">
          <button type="button" className="btn btn--primary" onClick={start}><RefreshIcon /> Play again</button>
          <button type="button" className="btn btn--quiet" onClick={onLeaderboard}><TrophyIcon /> Leaderboard</button>
        </div>
      </section>
    )
  }

  const run = phase.run
  const fraction = remaining / (CHALLENGE_SECONDS * 1000)
  return (
    <section className="challenge" aria-label="Challenge in progress">
      <div className="challenge__bar">
        <span className={`challenge__clock${remaining < 30_000 ? ' challenge__clock--low' : ''}`} aria-label={`${formatClock(remaining)} left`}>
          <TimerIcon width="18" height="18" /> {formatClock(remaining)}
        </span>
        <span className="challenge__score" aria-label={`Score ${run.made.length}`}>{run.made.length} <small>pts</small></span>
      </div>
      <div className="challenge__time" aria-hidden="true"><span style={{ width: `${fraction * 100}%` }} /></div>

      <div className="challenge__prompt">
        <span className="challenge__slot" aria-hidden="true">?</span>
        <span key={run.prompt} className="challenge__word">{run.prompt.toUpperCase()}</span>
        <span className="challenge__slot" aria-hidden="true">?</span>
      </div>
      <p className="challenge__hint">A word that goes before or after it</p>

      <form className="challenge__form" onSubmit={submit} noValidate>
        <label className="sr-only" htmlFor="challenge-answer">Word that goes with {run.prompt}</label>
        <input
          ref={input} id="challenge-answer" className="challenge__input" value={value}
          onChange={event => setValue(event.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="none"
          spellCheck={false} enterKeyHint="go" maxLength={24} placeholder="Your word"
        />
        <button type="submit" className="btn btn--primary">Go</button>
      </form>

      <p key={feedback?.key} className={`challenge__feedback${feedback ? (feedback.ok ? ' challenge__feedback--good' : ' challenge__feedback--bad') : ''}`}>
        {feedback && (feedback.ok
          ? <><CheckIcon width="16" height="16" /> {feedback.text} <strong>+1</strong></>
          : <><CrossIcon width="16" height="16" /> {feedback.text}</>)}
        {!feedback && ' '}
      </p>

      <div className="challenge__actions">
        <button type="button" className="btn btn--quiet btn--small" onClick={skip}>Skip word (−{SKIP_PENALTY_SECONDS}s)</button>
        <button type="button" className="link-button" onClick={() => void finish(run)}>End run</button>
      </div>

      {run.made.length > 0 && (
        <ul className="challenge__made challenge__made--live" aria-label="Your connections so far">
          {run.made.slice(-6).reverse().map((item, index) => <li key={run.made.length - index}>{item.phrase}</li>)}
        </ul>
      )}
    </section>
  )
}
