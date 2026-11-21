import { useEffect, useState } from 'react'
import { defaultName, fetchLeaderboard, ONLINE, savePlayer } from '../lib/online.ts'
import type { BoardRow, Leaderboard } from '../lib/online.ts'

type Tab = 'today' | 'all' | 'bridges'

const number = (value: number) => value.toLocaleString()

export function LeaderboardPanel({ playerId, onSettings }: { playerId: string; onSettings: () => void }) {
  const [data, setData] = useState<Leaderboard | null | 'loading'>('loading')
  const [tab, setTab] = useState<Tab>('today')

  useEffect(() => {
    let active = true
    fetchLeaderboard(playerId).then(result => { if (active) setData(result) })
    return () => { active = false }
  }, [playerId])

  if (!ONLINE) return <p className="dialog__lead">The leaderboard isn’t available in this copy of the game.</p>
  if (data === 'loading') return <p className="dialog__lead" role="status">Loading the leaderboard…</p>
  if (!data) return <p className="dialog__lead" role="status">The leaderboard couldn’t be reached. Check your connection and try again.</p>

  const { totals, you } = data
  const rows: BoardRow[] = tab === 'today' ? data.challengeToday : tab === 'all' ? data.challengeAllTime : data.mostBridges
  const yourRank = tab === 'bridges' ? you?.rankBridges : tab === 'all' ? you?.rankChallenge : null
  // Equal scores share a rank (1, 2, 2, 4).
  const ranks = rows.map(row => rows.findIndex(other => other.value === row.value) + 1)
  const isYou = (row: BoardRow, index: number) =>
    !!you && !you.hidden && row.name === you.name && (yourRank === null || yourRank === undefined || yourRank === ranks[index])

  return (
    <div className="board-panel">
      <dl className="stats__grid board-panel__totals">
        <div><dt>Bridges completed</dt><dd>{number(totals.games)}</dd></div>
        <div><dt>Bridges won</dt><dd>{number(totals.wins)}</dd></div>
        <div><dt>Challenge runs</dt><dd>{number(totals.runs)}</dd></div>
        <div><dt>Players</dt><dd>{number(totals.players)}</dd></div>
      </dl>

      <div className="segmented segmented--small board-panel__tabs" role="group" aria-label="Leaderboard">
        {([['today', 'Challenge today'], ['all', 'Challenge best'], ['bridges', 'Most bridges']] as const).map(([value, label]) => (
          <button key={value} type="button" className="segmented__button" aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="stats__empty">{tab === 'bridges' ? 'No finished bridges yet.' : 'No challenge scores yet. Be the first!'}</p>
      ) : (
        <ol className="board-panel__list">
          {rows.map((row, index) => (
            <li key={`${row.name}-${index}`} className={`board-panel__row${isYou(row, index) ? ' board-panel__row--you' : ''}`}>
              <span className="board-panel__rank">{ranks[index]}</span>
              <span className="board-panel__name">{row.name}{isYou(row, index) && <span className="board-panel__you"> (you)</span>}</span>
              <span className="board-panel__value">
                {number(row.value)}
                <small>{tab === 'bridges' ? ` ${row.value === 1 ? 'bridge' : 'bridges'} · ${number(row.wins ?? 0)} won` : ' pts'}</small>
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className="dialog__fine">
        {you
          ? <>You’re playing as <strong>{you.name}</strong>{you.hidden ? ' (hidden from the leaderboard)' : ''}: {number(you.games)} {you.games === 1 ? 'bridge' : 'bridges'}, best challenge {you.best}.{' '}</>
          : 'Finish a bridge or a challenge to appear here. '}
        <button type="button" className="link-button" onClick={onSettings}>Change name</button>
      </p>
      <p className="dialog__fine">Every finished Daily and Practice game counts. Scores come from players’ browsers and are checked, but this is a casual game, not a cheat-proof competition.</p>
    </div>
  )
}

/** Settings section: leaderboard name and visibility. */
export function LeaderboardSettings({ playerId, name, visible, onName, onVisible }: {
  playerId: string
  name: string | null
  visible: boolean
  onName: (name: string | null) => void
  onVisible: (visible: boolean) => void
}) {
  const [draft, setDraft] = useState(name ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'rejected' | 'error'>('idle')
  if (!ONLINE) return null

  async function saveName() {
    const trimmed = draft.replace(/\s+/g, ' ').trim()
    if (trimmed.length < 2 || trimmed.length > 20) { setStatus('rejected'); return }
    setStatus('saving')
    const result = await savePlayer(playerId, { name: trimmed })
    if (result === 'saved') { onName(trimmed); setStatus('saved') } else setStatus(result === 'name-rejected' ? 'rejected' : 'error')
  }

  return (
    <section className="settings__group">
      <h3 className="dialog__subtitle">Leaderboard</h3>
      <form className="settings__name" onSubmit={event => { event.preventDefault(); void saveName() }}>
        <label htmlFor="leaderboard-name">Your name</label>
        <div className="settings__name-row">
          <input
            id="leaderboard-name" className="settings__input" value={draft} maxLength={20} autoComplete="nickname"
            placeholder={playerId ? defaultName(playerId) : 'Bridge Builder'} onChange={event => { setDraft(event.target.value); setStatus('idle') }}
          />
          <button type="submit" className="btn btn--quiet btn--small" disabled={status === 'saving'}>Save</button>
        </div>
      </form>
      <p className="dialog__fine" role="status">
        {status === 'saved' && 'Saved.'}
        {status === 'saving' && 'Saving…'}
        {status === 'rejected' && 'Use 2–20 letters or numbers, and nothing offensive.'}
        {status === 'error' && 'Couldn’t save right now. Try again later.'}
        {status === 'idle' && 'Shown on the global leaderboard. No account or email needed.'}
      </p>
      <label className="settings__check">
        <input
          type="checkbox" checked={visible}
          onChange={async event => {
            const show = event.target.checked
            onVisible(show)
            await savePlayer(playerId, { hidden: !show })
          }}
        />
        <span>Show me on the global leaderboard (your games still count in the totals)</span>
      </label>
    </section>
  )
}
