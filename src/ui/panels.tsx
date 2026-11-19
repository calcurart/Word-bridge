import { useState } from 'react'
import { COMMUNITY_API, suggestLink } from '../lib/community.ts'
import type { SuggestResult, SuggestStatus } from '../lib/community.ts'
import type { DailyStats } from '../lib/stats.ts'
import type { Theme } from '../lib/storage.ts'
import { copyText } from './clipboard.ts'
import { CheckIcon, CopyIcon, CrossIcon } from './icons.tsx'

export function StatsPanel({ stats, nextDaily, highlight }: { stats: DailyStats; nextDaily: string; highlight: number | null }) {
  const most = Math.max(1, ...stats.distribution)
  return (
    <div className="stats">
      <p className="dialog__lead">Daily Bridge results. Practice games aren’t counted.</p>
      <dl className="stats__grid">
        <div><dt>Played</dt><dd>{stats.played}</dd></div>
        <div><dt>Win %</dt><dd>{stats.winRate}</dd></div>
        <div><dt>Current streak</dt><dd>{stats.currentStreak}</dd></div>
        <div><dt>Best streak</dt><dd>{stats.bestStreak}</dd></div>
      </dl>
      <h3 className="dialog__subtitle">Wins by checks used</h3>
      {stats.wins === 0 ? (
        <p className="stats__empty">Solve a Daily Bridge to start your chart.</p>
      ) : (
        <ol className="distribution">
          {stats.distribution.map((count, index) => (
            <li key={index} className={`distribution__row${highlight === index + 1 ? ' distribution__row--today' : ''}`}>
              <span className="distribution__label" aria-hidden="true">{index + 1}</span>
              <span className="distribution__track" aria-hidden="true">
                <span className="distribution__bar" style={{ width: `${Math.max(8, (count / most) * 100)}%` }}>{count}</span>
              </span>
              <span className="sr-only">
                {index + 1} {index === 0 ? 'check' : 'checks'}: {count} {count === 1 ? 'win' : 'wins'}{highlight === index + 1 ? ', including today' : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="stats__next">{nextDaily}</p>
      <p className="dialog__fine">Streaks count wins on consecutive daily puzzles (UTC dates). An unfinished puzzle today doesn’t break yesterday’s streak.</p>
    </div>
  )
}

export function SettingsPanel({ theme, onTheme, onTutorial, onReset }: {
  theme: Theme
  onTheme: (theme: Theme) => void
  onTutorial: () => void
  onReset: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const options: { value: Theme; label: string }[] = [
    { value: 'system', label: 'Match device' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ]
  return (
    <div className="settings">
      <fieldset className="settings__group">
        <legend className="dialog__subtitle">Theme</legend>
        <div className="segmented segmented--small">
          {options.map(option => (
            <label key={option.value} className="segmented__option">
              <input type="radio" name="theme" value={option.value} checked={theme === option.value} onChange={() => onTheme(option.value)} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="settings__group">
        <h3 className="dialog__subtitle">How to play</h3>
        <button type="button" className="btn btn--quiet btn--small" onClick={onTutorial}>Show the tutorial</button>
      </section>

      <section className="settings__group">
        <h3 className="dialog__subtitle">Your data</h3>
        <p className="dialog__fine">
          Progress and statistics are stored only in this browser. The only thing ever sent is a phrase you choose to
          suggest.
        </p>
        {confirming ? (
          <div className="confirm" role="alertdialog" aria-labelledby="confirm-text">
            <p id="confirm-text"><strong>Delete all daily results, streaks and practice progress?</strong> This can’t be undone.</p>
            <div className="confirm__buttons">
              <button type="button" className="btn btn--quiet btn--small" onClick={() => setConfirming(false)} autoFocus>Cancel</button>
              <button type="button" className="btn btn--danger btn--small" onClick={() => { setConfirming(false); onReset() }}>Delete everything</button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn--quiet btn--small" onClick={() => setConfirming(true)}>Reset all data…</button>
        )}
      </section>

      <section className="settings__group">
        <h3 className="dialog__subtitle">About</h3>
        <p className="dialog__fine">
          Word Bridge checks each link against a curated dictionary of familiar compounds and phrases built into the
          game, plus phrases players have suggested that were confirmed in Wiktionary. Checking works offline, with no
          accounts or tracking. Because the puzzles and answers ship with the page, anyone can inspect them: this is a
          casual game, not a cheat-proof competition.
        </p>
      </section>
    </div>
  )
}

const SUGGEST_MESSAGES: Record<Exclude<SuggestStatus, 'added' | 'exists'>, string> = {
  'not-found': 'Wiktionary doesn’t list this as a word or phrase, so it wasn’t added.',
  unfamiliar: 'Wiktionary only lists this as a rare, old-fashioned or misspelled form, so it wasn’t added.',
  offensive: 'This one isn’t suitable for the game, so it wasn’t added.',
  invalid: 'Only pairs of single words made of letters can be suggested.',
  'rate-limited': 'Lots of suggestions are arriving right now. Please try again a little later.',
  error: 'The dictionary couldn’t be checked right now. Please try again later.',
  offline: 'The suggestion service couldn’t be reached. Check your connection and try again.',
}

export function SuggestPanel({ from, to, onAdded }: { from: string; to: string; onAdded: (source: string) => string }) {
  const [state, setState] = useState<{ phase: 'idle' | 'checking' } | { phase: 'done'; result: SuggestResult; note: string }>({ phase: 'idle' })
  const pair = `${from.toUpperCase()} ${to.toUpperCase()}`

  async function check() {
    setState({ phase: 'checking' })
    const result = await suggestLink(from, to)
    const note = (result.status === 'added' || result.status === 'exists') && result.source ? onAdded(result.source) : ''
    setState({ phase: 'done', result, note })
  }

  if (!COMMUNITY_API) return <CopySuggestion from={from} to={to} />

  const result = state.phase === 'done' ? state.result : null
  const accepted = result && (result.status === 'added' || result.status === 'exists')
  return (
    <div className="suggest">
      <p>
        <strong>{pair}</strong> isn’t in this game’s dictionary yet. Is it a real word or phrase, read left to right?
      </p>
      <p className="dialog__fine">
        Suggest it and the game looks it up in Wiktionary, a free online dictionary. If it’s listed as an English word
        or phrase (and isn’t offensive), it’s added to Word Bridge for every player straight away.
      </p>
      {!accepted && (
        <div className="suggest__actions">
          <button type="button" className="btn btn--primary btn--small" onClick={check} disabled={state.phase === 'checking'}>
            {state.phase === 'checking' ? 'Looking it up…' : `Suggest ${pair}`}
          </button>
        </div>
      )}
      <div role="status" className={`suggest__result${accepted ? ' suggest__result--good' : result ? ' suggest__result--bad' : ''}`}>
        {result && (accepted
          ? <><CheckIcon width="18" height="18" /><span>
              {result.status === 'added' ? 'Found it! ' : 'Already added by another player. '}
              “{result.source ? parseLinkPhrase(result.source) : `${from} ${to}`}” is now part of Word Bridge for everyone.{state.phase === 'done' && state.note ? ` ${state.note}` : ''}
            </span></>
          : <><CrossIcon width="18" height="18" /><span>{SUGGEST_MESSAGES[result.status as keyof typeof SUGGEST_MESSAGES]}</span></>)}
      </div>
      <p className="dialog__fine">
        Only the two words are sent, to Word Bridge’s phrase service and from there to Wiktionary.
      </p>
    </div>
  )
}

/** "sun+hat" -> "sunhat", "fire alarm" -> "fire alarm". */
function parseLinkPhrase(source: string): string {
  return source.replace('+', '')
}

/** Fallback when no phrase service is configured: a suggestion the player can copy and pass on. */
function CopySuggestion({ from, to }: { from: string; to: string }) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const pair = `${from.toUpperCase()} ${to.toUpperCase()}`
  const text = `Word Bridge phrase suggestion: please consider adding “${from} ${to}” (${from.toUpperCase()} → ${to.toUpperCase()}) as a familiar compound or phrase.`
  return (
    <div className="suggest">
      <p>
        <strong>{pair}</strong> isn’t in this game’s dictionary. That doesn’t mean it isn’t English: the game only
        knows a curated collection of familiar compounds and phrases, read left to right.
      </p>
      <p className="dialog__fine">
        This copy of the game isn’t connected to a phrase service, so nothing is sent from here. If you think it
        belongs, copy the suggestion and pass it on to whoever runs the game.
      </p>
      <label className="sr-only" htmlFor="suggestion-text">Suggestion text</label>
      <textarea id="suggestion-text" className="manual-copy" readOnly value={text} rows={3} onFocus={event => event.currentTarget.select()} />
      <div className="suggest__actions">
        <button
          type="button" className="btn btn--primary btn--small"
          onClick={async () => setCopied((await copyText(text)) ? 'copied' : 'failed')}
        >
          <CopyIcon /> Copy suggestion
        </button>
        <span role="status" className="suggest__status">
          {copied === 'copied' ? 'Copied. Nothing was sent.' : copied === 'failed' ? 'Couldn’t copy. Select the text above instead.' : ''}
        </span>
      </div>
    </div>
  )
}
