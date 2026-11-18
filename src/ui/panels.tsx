import { useState } from 'react'
import type { DailyStats } from '../lib/stats.ts'
import type { Theme } from '../lib/storage.ts'
import { copyText } from './clipboard.ts'
import { CopyIcon } from './icons.tsx'

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
        <p className="dialog__fine">Progress and statistics are stored only in this browser. Nothing is sent anywhere.</p>
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
          game. It works offline, with no accounts or tracking. Because the puzzles and answers ship with the page,
          anyone can inspect them: this is a casual game, not a cheat-proof competition.
        </p>
      </section>
    </div>
  )
}

export function SuggestPanel({ from, to }: { from: string; to: string }) {
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
        This game has no server, so nothing is sent from here. If you think it belongs, copy the suggestion and pass it
        on to whoever runs the game.
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
