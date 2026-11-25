import { Fragment, useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, KeyboardEvent, RefObject } from 'react'
import type { Puzzle } from '../data/puzzles.ts'
import {
  chainLinks, checkBridge, checksLeft, editEntry, fullChain, gameStatus, hintsLeft, isHinted, MAX_CHECKS, maxHints,
  revealSolution, takeHint,
} from '../lib/game.ts'
import type { GameRecord, LinkFeedback } from '../lib/game.ts'
import { findLink, normalizeEntry } from '../lib/graph.ts'
import type { WordGraph } from '../lib/graph.ts'
import { hintCount, shareText } from '../lib/share.ts'
import type { ShareLabel } from '../lib/share.ts'
import awaitingIcon from '../assets/icons/awaiting.svg'
import { FigmaIcon } from './FigmaIcon.tsx'
import { shareOrCopy } from './clipboard.ts'
import { prefersReducedMotion } from './hooks.ts'
import { ArrowIcon, CheckIcon, CrossIcon, RefreshIcon, ShareIcon } from './icons.tsx'

type Props = {
  puzzle: Puzzle
  record: GameRecord
  /** The dictionary, including community phrases loaded while playing. */
  graph: WordGraph
  mode: 'daily' | 'practice'
  shareLabel: ShareLabel
  /** "Next Daily Bridge in …" text, daily only. */
  nextDaily: string | null
  onRecord: (record: GameRecord) => void
  onAnnounce: (text: string) => void
  onPlayMore: () => void
  onSuggest: (from: string, to: string) => void
}

type Message = { text: string; tone: 'info' | 'warn' | 'good' }

const upper = (word: string) => word.toUpperCase()
const isCoarsePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

export function GameBoard({ puzzle, record, graph, mode, shareLabel, nextDaily, onRecord, onAnnounce, onPlayMore, onSuggest }: Props) {
  const status = gameStatus(record)
  const finished = status !== 'playing'
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const resultHeading = useRef<HTMLHeadingElement>(null)
  const wasPlaying = useRef(!finished)
  const [message, setMessage] = useState<Message | null>(null)
  const ids = useId()

  // Move focus to the result when the game ends during this visit (not when restoring a finished game).
  useEffect(() => {
    if (finished && wasPlaying.current) {
      resultHeading.current?.focus({ preventScroll: true })
      resultHeading.current?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    }
    wasPlaying.current = !finished
  }, [finished])

  const words = record.entries.map(normalizeEntry)
  const chainForLabels = fullChain(puzzle, record.entries.map((entry, gap) => normalizeEntry(entry) || `word ${gap + 1}`))
  const left = checksLeft(record)
  const hintsRemaining = hintsLeft(puzzle, record)

  const focusGap = (gap: number) => inputs.current[gap]?.focus()

  function edit(gap: number, value: string) {
    onRecord(editEntry(record, gap, value))
    if (message?.tone === 'warn') setMessage(null)
  }

  function check() {
    const result = checkBridge(puzzle, record, graph)
    switch (result.kind) {
      case 'finished':
        return
      case 'incomplete': {
        const text = 'Fill every gap before checking. Incomplete bridges don’t use a check.'
        setMessage({ text, tone: 'warn' })
        onAnnounce(text)
        focusGap(result.gaps[0])
        return
      }
      case 'not-one-word': {
        const text = `Each gap holds a single word, letters only. Check word ${result.gaps[0] + 1}.`
        setMessage({ text, tone: 'warn' })
        onAnnounce(text)
        focusGap(result.gaps[0])
        return
      }
      case 'duplicate': {
        onRecord(result.record)
        const text = `You already checked this bridge (check ${result.attempt + 1}), so it didn’t use another check.`
        setMessage({ text, tone: 'info' })
        onAnnounce(text)
        return
      }
      case 'checked': {
        onRecord(result.record)
        const after = gameStatus(result.record)
        const chain = fullChain(puzzle, result.record.entries)
        const good = result.links.filter(Boolean).length
        if (after === 'won') {
          setMessage(null)
          onAnnounce(`Bridge complete in ${result.record.attempts.length} of ${MAX_CHECKS} checks!`)
          return
        }
        const unknown = result.links.flatMap((ok, link) => (ok ? [] : [`${upper(chain[link])} to ${upper(chain[link + 1])}`]))
        if (after === 'lost') {
          const solution = fullChain(puzzle, revealSolution(puzzle, result.record, graph)).map(upper).join(', ')
          setMessage(null)
          onAnnounce(`Out of checks. One possible solution: ${solution}.`)
          return
        }
        const remaining = checksLeft(result.record)
        const text = `${good} of ${result.links.length} links recognized. ${remaining} ${remaining === 1 ? 'check' : 'checks'} left.`
        setMessage({ text, tone: 'info' })
        onAnnounce(`${text} Not in this game’s dictionary: ${unknown.join('; ')}.`)
      }
    }
  }

  function hint() {
    const result = takeHint(puzzle, record, graph)
    if (result.kind !== 'hint') return
    onRecord(result.record)
    let text = `Hint: word ${result.gap + 1} is ${upper(result.word)}.`
    if (result.conflicts > 0) text += ' Some of your other words may need to change to fit it.'
    else if (result.othersFilled > 0) text += ' It works with your other words.'
    setMessage({ text, tone: 'good' })
    onAnnounce(text)
    // The hint button disappears from the tab order once hints run out; keep focus somewhere useful.
    if (hintsLeft(puzzle, result.record) === 0) {
      const next = result.record.entries.findIndex((entry, gap) => !result.record.hints.some(h => h.gap === gap) && entry.trim() === '')
      const target = next !== -1 ? next : result.record.entries.findIndex((_, gap) => !result.record.hints.some(h => h.gap === gap))
      window.setTimeout(() => focusGap(target), 0)
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    check()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, gap: number) {
    if (event.key !== 'Enter' || finished) return
    const empty = words.flatMap((word, index) => (word === '' ? [index] : []))
    if (empty.length === 0) return // the form submits: check the bridge
    event.preventDefault()
    if (words[gap] === '') {
      check()
      return
    }
    focusGap(empty.find(index => index > gap) ?? empty[0])
  }

  const linkCount = record.feedback.length
  const connected = record.feedback.filter(state => state === true).length

  return (
    <section className={`board card${status === 'won' ? ' board--won' : ''}`} aria-labelledby={`${ids}-board-title`}>
      <div className="board__progress">
        <h2 id={`${ids}-board-title`} className="board__title">Build your bridge</h2>
        <p className="links-meter">
          <span>{connected} of {linkCount} links connected</span>
          <span className="links-meter__bars" aria-hidden="true">
            {record.feedback.map((state, index) => (
              <span key={index} className={`links-meter__bar${state === true ? ' links-meter__bar--on' : ''}`} />
            ))}
          </span>
        </p>
      </div>

      <form className="board__form" onSubmit={onSubmit} noValidate aria-label="Word bridge puzzle">
        <ol className={`bridge${status === 'won' ? ' bridge--won' : ''}`} aria-label={`Bridge from ${upper(puzzle.start)} to ${upper(puzzle.end)}`}>
          <li className="bridge__step"><EndTile word={puzzle.start} label="Start" /></li>
          {record.entries.map((entry, gap) => {
            const hinted = isHinted(record, gap)
            const nextEmpty = words.some((word, index) => index !== gap && word === '')
            return (
              <Fragment key={gap}>
                <li className="bridge__step">
                  <Connector
                    index={gap} from={chainForLabels[gap]} to={chainForLabels[gap + 1]}
                    state={record.feedback[gap]} graph={graph} onSuggest={onSuggest}
                  />
                </li>
                <li className="bridge__step">
                  <div className={`tile tile--gap${hinted ? ' tile--hint' : ''}${entry.trim() ? ' tile--filled' : ''}`}>
                    <label className="tile__tag" htmlFor={`${ids}-gap-${gap}`}>
                      {hinted
                        ? <><FigmaIcon name="hint" className="tile__hint-icon" /> <span>Hint</span></>
                        : <span aria-hidden="true">{String(gap + 1).padStart(2, '0')}</span>}
                      <span className="sr-only">
                        Missing word {gap + 1} of {puzzle.gaps}{hinted ? ', revealed by a hint' : ''}
                      </span>
                    </label>
                    <input
                      ref={element => { inputs.current[gap] = element }}
                      id={`${ids}-gap-${gap}`}
                      className="tile__input"
                      type="text"
                      aria-label={`Missing word ${gap + 1} of ${puzzle.gaps}${hinted ? ', revealed by a hint' : ''}`}
                      value={entry}
                      onChange={event => edit(gap, event.target.value)}
                      onKeyDown={event => onKeyDown(event, gap)}
                      onFocus={event => {
                        if (!isCoarsePointer()) return
                        const target = event.currentTarget
                        // Give the on-screen keyboard time to open, then keep the field and buttons in view.
                        window.setTimeout(() => target.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }), 300)
                      }}
                      readOnly={hinted || finished}
                      aria-readonly={hinted || finished}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      enterKeyHint={nextEmpty ? 'next' : 'go'}
                      maxLength={24}
                      placeholder={finished ? '' : '?'}
                    />
                    <span className="tile__status" aria-hidden="true">
                      {!hinted && !finished && <span className="tile__editing">Editing</span>}
                      {record.feedback[gap] === true && <FigmaIcon name="checkWord" className="tile__check" />}
                    </span>
                  </div>
                </li>
              </Fragment>
            )
          })}
          <li className="bridge__step">
            <Connector
              index={puzzle.gaps} from={chainForLabels[puzzle.gaps]} to={chainForLabels[puzzle.gaps + 1]}
              state={record.feedback[puzzle.gaps]} graph={graph} onSuggest={onSuggest}
            />
          </li>
          <li className="bridge__step"><EndTile word={puzzle.end} label="End" /></li>
        </ol>

        {!finished && (
          <div className="controls">
            <div className="controls__buttons">
              <button
                type="button" className="btn btn--quiet btn--hint" onClick={hint} disabled={hintsRemaining <= 0}
                aria-describedby={`${ids}-hint-note`}
              >
                <FigmaIcon name="hint" /> Hint
                <span className="btn__badge" aria-hidden="true">{hintsRemaining}</span>
              </button>
              <button type="submit" className="btn btn--primary btn--check">
                Check bridge <FigmaIcon name="arrowButton" className="btn__arrow" />
              </button>
            </div>
            <div className="controls__meta">
              <CheckMeter left={left} />
              <span className="controls__key"><FigmaIcon name="enter" /> Enter to check</span>
            </div>
            <p id={`${ids}-hint-note`} className="sr-only">
              {hintsRemaining > 0
                ? `${hintsRemaining} of ${maxHints(puzzle)} ${maxHints(puzzle) === 1 ? 'hint' : 'hints'} left. A hint reveals a word and doesn’t use a check.`
                : 'No hints left.'}
            </p>
            <p className={`message${message ? ` message--${message.tone}` : ''}`}>{message?.text ?? ' '}</p>
          </div>
        )}
      </form>

      {finished && (
        <Result
          puzzle={puzzle} record={record} graph={graph} mode={mode} shareLabel={shareLabel} nextDaily={nextDaily}
          headingRef={resultHeading} onPlayMore={onPlayMore} onAnnounce={onAnnounce}
        />
      )}

      {record.attempts.length > 0 && <History puzzle={puzzle} record={record} />}
    </section>
  )
}

function EndTile({ word, label }: { word: string; label: string }) {
  return (
    <div className="tile tile--end">
      <span className="tile__tag">{label}</span>
      <span className="tile__word">{upper(word)}</span>
      <span className="tile__status"><FigmaIcon name="lock" /></span>
    </div>
  )
}

function Connector({ index, from, to, state, graph, onSuggest }: {
  index: number
  from: string
  to: string
  state: LinkFeedback
  graph: WordGraph
  onSuggest: (from: string, to: string) => void
}) {
  const link = state === true ? findLink(graph, from, to) : undefined
  const label = `Link ${index + 1}, ${upper(from)} to ${upper(to)}`
  const style = { '--i': index } as CSSProperties
  if (state === true) {
    return (
      <div className="link link--good" style={style}>
        <span className="link__line" aria-hidden="true" />
        <span className="pill pill--good">
          <FigmaIcon name="checkLink" />
          <span className="sr-only">{label}: recognized, </span>
          <span>{link?.phrase ?? `${from} ${to}`}</span>
        </span>
      </div>
    )
  }
  if (state === false) {
    return (
      <div className="link link--bad" style={style}>
        <span className="link__line" aria-hidden="true" />
        <button
          type="button" className="pill pill--bad" onClick={() => onSuggest(from, to)}
          aria-label={`${label}: not in this game’s dictionary. Suggest this phrase.`}
        >
          <CrossIcon width="12" height="12" />
          <span>Not in this game’s dictionary</span>
          <span className="pill__more" aria-hidden="true">Suggest</span>
        </button>
      </div>
    )
  }
  return (
    <div className="link" style={style}>
      <span className="link__line" aria-hidden="true" />
      <img className="link__await" src={awaitingIcon} width="16" height="16" alt="" />
      <span className="sr-only">{label}: not checked yet.</span>
    </div>
  )
}

function CheckMeter({ left }: { left: number }) {
  return (
    <div className="meter">
      <span className="meter__dots" aria-hidden="true">
        {Array.from({ length: MAX_CHECKS }, (_, index) => (
          <span key={index} className={`meter__dot${index < left ? ' meter__dot--on' : ''}`} />
        ))}
      </span>
      <span className="meter__text">{left} of {MAX_CHECKS} checks left</span>
    </div>
  )
}

function History({ puzzle, record }: { puzzle: Puzzle; record: GameRecord }) {
  return (
    <details className="history">
      <summary>
        <FigmaIcon name="history" />
        <span>Previous checks</span>
        <span className="history__count">{record.attempts.length}</span>
        <FigmaIcon name="chevronRight" className="history__chevron" />
      </summary>
      <ol className="history__list">
        {record.attempts.map((attempt, index) => {
          const chain = fullChain(puzzle, attempt.words)
          return (
            <li key={index} className="history__item">
              <span className="history__number" aria-hidden="true">{index + 1}</span>
              <span className="sr-only">Check {index + 1}: </span>
              <span className="history__chain">
                {chain.map((word, position) => (
                  <Fragment key={position}>
                    <span className={`history__word${position === 0 || position === chain.length - 1 ? ' history__word--end' : ''}`}>{upper(word)}</span>
                    {position < attempt.links.length && (
                      attempt.links[position]
                        ? <span className="history__mark history__mark--good"><CheckIcon width="13" height="13" /><span className="sr-only">recognized</span></span>
                        : <span className="history__mark history__mark--bad"><CrossIcon width="13" height="13" /><span className="sr-only">not in dictionary</span></span>
                    )}
                  </Fragment>
                ))}
              </span>
            </li>
          )
        })}
      </ol>
    </details>
  )
}

function Result({ puzzle, record, graph, mode, shareLabel, nextDaily, headingRef, onPlayMore, onAnnounce }: {
  puzzle: Puzzle
  record: GameRecord
  graph: WordGraph
  mode: 'daily' | 'practice'
  shareLabel: ShareLabel
  nextDaily: string | null
  headingRef: RefObject<HTMLHeadingElement | null>
  onPlayMore: () => void
  onAnnounce: (text: string) => void
}) {
  const won = gameStatus(record) === 'won'
  const words = won ? record.attempts[record.attempts.length - 1].words : revealSolution(puzzle, record, graph)
  const chain = fullChain(puzzle, words)
  const links = chainLinks(chain, graph)
  const [shareState, setShareState] = useState<{ text: string; manual: string | null } | null>(null)
  const manualRef = useRef<HTMLTextAreaElement>(null)
  const ids = useId()

  useEffect(() => {
    if (shareState?.manual) manualRef.current?.select()
  }, [shareState])

  async function share() {
    const text = shareText(record, shareLabel)
    const outcome = await shareOrCopy(text)
    const feedback = {
      shared: { text: 'Shared!', manual: null },
      copied: { text: 'Result copied. Paste it anywhere.', manual: null },
      canceled: { text: 'Sharing canceled.', manual: null },
      manual: { text: 'Copy your result from the box below.', manual: text },
    }[outcome]
    setShareState(feedback)
    onAnnounce(feedback.text)
  }

  return (
    <section className={`result result--${won ? 'won' : 'lost'}`} aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`} className="result__title" tabIndex={-1} ref={headingRef}>
        {won ? 'Bridge complete!' : 'Out of checks'}
      </h2>
      <p className="result__summary">
        {won ? `Solved in ${record.attempts.length} of ${MAX_CHECKS} checks` : `All ${MAX_CHECKS} checks used`}
        {' · '}{hintCount(record.hints.length)}
      </p>

      <p className="result__label">{won ? 'Your bridge' : 'One possible solution'}</p>
      <p className="result__chain">
        {chain.map((word, index) => (
          <Fragment key={index}>
            {index > 0 && <ArrowIcon className="result__arrow" width="14" height="14" />}
            <span className="result__word">{upper(word)}</span>
          </Fragment>
        ))}
      </p>

      <ul className="phrases" aria-label={won ? 'Links in your bridge' : 'Links in this solution'}>
        {links.map((link, index) => (
          <li key={index} className="phrases__item" style={{ '--i': index } as CSSProperties}>
            <span className="phrases__pair">{upper(chain[index])} + {upper(chain[index + 1])}</span>
            <span className="phrases__phrase">{link?.phrase ?? `${chain[index]} ${chain[index + 1]}`}</span>
            {link?.note && <span className="phrases__note">{link.note}</span>}
          </li>
        ))}
      </ul>

      <div className="result__actions">
        <button type="button" className="btn btn--primary" onClick={share}>
          <ShareIcon /> Share result
        </button>
        <button type="button" className="btn btn--quiet" onClick={onPlayMore}>
          <RefreshIcon /> {mode === 'daily' ? 'Play practice' : 'Play again'}
        </button>
      </div>
      <p className="result__share-status" aria-hidden="true">{shareState?.text ?? ' '}</p>
      {shareState?.manual && (
        <textarea
          ref={manualRef} className="manual-copy" readOnly value={shareState.manual}
          rows={shareState.manual.split('\n').length} aria-label="Your result, ready to copy"
        />
      )}
      {nextDaily && <p className="result__next">{nextDaily}</p>}
    </section>
  )
}
