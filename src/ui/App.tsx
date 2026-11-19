import { useCallback, useEffect, useMemo, useState } from 'react'
import { PUZZLE_BY_ID, PUZZLES } from '../data/puzzles.ts'
import { fetchCommunityLinks } from '../lib/community.ts'
import { gameStatus, hasProgress, newGame, recheckLatest } from '../lib/game.ts'
import type { GameRecord } from '../lib/game.ts'
import { buildGraph, dictionarySources } from '../lib/graph.ts'
import { pickPractice, rememberPractice } from '../lib/practice.ts'
import { dailyForDay, formatCountdown, timeUntilNextDay, utcDay } from '../lib/schedule.ts'
import { dailyStats } from '../lib/stats.ts'
import { loadSave, resetSave, withDaily, writeSave } from '../lib/storage.ts'
import type { Save, Theme } from '../lib/storage.ts'
import { Dialog } from './Dialog.tsx'
import { GameBoard } from './GameBoard.tsx'
import { useNow } from './hooks.ts'
import { BridgeMark, CloseIcon, HelpIcon, InfoIcon, SettingsIcon, StatsIcon } from './icons.tsx'
import { SettingsPanel, StatsPanel, SuggestPanel } from './panels.tsx'
import { Tutorial } from './Tutorial.tsx'

type Mode = 'daily' | 'practice'
type DialogName = 'help' | 'stats' | 'settings'
type StorageIssue = 'unavailable' | 'recovered' | 'write-failed'

const STORAGE_MESSAGES: Record<StorageIssue, string> = {
  unavailable: 'This browser is blocking storage, so progress won’t be kept after you leave. The game still works.',
  'write-failed': 'Progress couldn’t be saved (storage may be full or blocked). The game still works.',
  recovered: 'Saved progress couldn’t be read, so the game started fresh. A copy of the old data was kept in this browser.',
}

function newPractice(save: Save, today: number): Save {
  const avoid = new Set([dailyForDay(today).puzzleId, ...(save.practice ? [save.practice.puzzleId] : [])])
  const puzzle = pickPractice(PUZZLES, avoid, save.recentPractice)
  return { ...save, practice: newGame(puzzle), recentPractice: rememberPractice(save.recentPractice, puzzle.id) }
}

export function App() {
  const [initial] = useState(() => loadSave())
  const [save, setSave] = useState<Save>(initial.save)
  const [storageIssue, setStorageIssue] = useState<StorageIssue | null>(initial.status === 'ok' ? null : initial.status)
  const now = useNow()
  const today = utcDay(now)
  const [mode, setMode] = useState<Mode>('daily')
  const [dailyDay, setDailyDay] = useState(today)
  const [newDayReady, setNewDayReady] = useState(false)
  const [dialog, setDialog] = useState<DialogName | null>(initial.save.tutorialSeen ? null : 'help')
  const [suggestion, setSuggestion] = useState<{ from: string; to: string } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  // Phrases added by players since this copy of the game was built, fetched from the phrase service.
  const [extraLinks, setExtraLinks] = useState<readonly string[]>([])
  const graph = useMemo(() => buildGraph(dictionarySources(extraLinks)), [extraLinks])

  useEffect(() => {
    let active = true
    fetchCommunityLinks().then(links => {
      if (active && links.length > 0) setExtraLinks(current => [...new Set([...current, ...links])])
    })
    return () => { active = false }
  }, [])

  const announce = useCallback((text: string) => {
    // Appending an invisible character lets the same sentence be announced twice in a row.
    setAnnouncement(previous => (previous === text ? `${text}​` : text))
  }, [])

  // Persist every change. If writing fails, say so once but keep playing.
  useEffect(() => {
    const ok = writeSave(save)
    setStorageIssue(previous => (ok ? (previous === 'write-failed' ? null : previous) : (previous ?? 'write-failed')))
  }, [save])

  // Theme: follow the system until the player picks one, then remember it.
  useEffect(() => {
    const root = document.documentElement
    if (save.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = save.theme
  }, [save.theme])

  const assignment = dailyForDay(dailyDay)
  const dailyPuzzle = PUZZLE_BY_ID.get(assignment.puzzleId)!
  const dailyRecord = save.daily[String(assignment.day)] ?? newGame(dailyPuzzle)

  // UTC rollover while the page is open. Switch straight to the new puzzle unless the player
  // has been working on (or just finished) the old one; then offer the switch instead.
  useEffect(() => {
    if (dailyForDay(today).day === assignment.day) return
    const shownRecord = save.daily[String(assignment.day)]
    if (mode === 'daily' && shownRecord && hasProgress(shownRecord)) {
      setNewDayReady(true)
    } else {
      setDailyDay(today)
      setNewDayReady(false)
      if (mode === 'daily') announce('A new Daily Bridge is ready.')
    }
  }, [today, assignment.day, mode, save.daily, announce])

  const goToToday = () => {
    setDailyDay(today)
    setNewDayReady(false)
    setMode('daily')
    announce(`Daily Bridge number ${dailyForDay(today).number}.`)
  }

  const practiceRecord = save.practice
  const practicePuzzle = practiceRecord ? PUZZLE_BY_ID.get(practiceRecord.puzzleId) : undefined

  function openPractice() {
    setMode('practice')
    setSave(current => {
      const record = current.practice
      const stale = !record || (!hasProgress(record) && record.puzzleId === dailyForDay(today).puzzleId)
      return stale ? newPractice(current, today) : current
    })
  }

  function playAgain() {
    setSave(current => newPractice(current, today))
    announce('New practice puzzle.')
    window.scrollTo({ top: 0 })
  }

  const updateDaily = useCallback((record: GameRecord) => {
    setSave(current => withDaily(current, assignment.day, record))
  }, [assignment.day])

  const updatePractice = useCallback((record: GameRecord) => {
    setSave(current => ({ ...current, practice: record }))
  }, [])

  const stats = useMemo(() => dailyStats(save.daily, today), [save.daily, today])
  const todayRecord = save.daily[String(dailyForDay(today).day)]
  const todayWinChecks = todayRecord && gameStatus(todayRecord) === 'won' ? todayRecord.attempts.length : null
  const countdown = `Next Daily Bridge in ${formatCountdown(timeUntilNextDay(now))}`

  const closeDialog = () => {
    if (dialog === 'help' && !save.tutorialSeen) setSave(current => ({ ...current, tutorialSeen: true }))
    setDialog(null)
  }

  const showingDaily = mode === 'daily'
  const puzzle = showingDaily ? dailyPuzzle : practicePuzzle
  const record = showingDaily ? dailyRecord : practiceRecord
  const olderDaily = showingDaily && assignment.day !== dailyForDay(today).day

  /** A suggestion was accepted: use the phrase now, and re-check the latest bridge for free if it's still on screen. */
  function addPhrase(source: string): string {
    const links = [...new Set([...extraLinks, source])]
    setExtraLinks(links)
    if (!puzzle || !record) return ''
    const updated = recheckLatest(puzzle, record, buildGraph(dictionarySources(links)))
    if (updated === record) return ''
    if (showingDaily) updateDaily(updated)
    else updatePractice(updated)
    const note = gameStatus(updated) === 'won'
      ? 'Your bridge was re-checked without using a check, and it’s complete!'
      : 'Your latest bridge was re-checked without using a check.'
    announce(note)
    return note
  }

  return (
    <div className="app">
      <a className="skip-link" href="#puzzle">Skip to puzzle</a>
      <header className="masthead">
        <div className="masthead__bar">
          <h1 className="wordmark"><BridgeMark /><span>Word Bridge</span></h1>
          <nav className="masthead__tools" aria-label="Game menu">
            <button type="button" className="icon-button" onClick={() => setDialog('help')} aria-label="How to play"><HelpIcon /></button>
            <button type="button" className="icon-button" onClick={() => setDialog('stats')} aria-label="Statistics"><StatsIcon /></button>
            <button type="button" className="icon-button" onClick={() => setDialog('settings')} aria-label="Settings"><SettingsIcon /></button>
          </nav>
        </div>
        <div className="segmented" role="group" aria-label="Game mode">
          <button type="button" className="segmented__button" aria-pressed={showingDaily} onClick={() => setMode('daily')}>Daily</button>
          <button type="button" className="segmented__button" aria-pressed={!showingDaily} onClick={openPractice}>Practice</button>
        </div>
      </header>

      {storageIssue && (
        <div className="notice" role="status">
          <InfoIcon />
          <p>{STORAGE_MESSAGES[storageIssue]}</p>
          <button type="button" className="icon-button icon-button--small" onClick={() => setStorageIssue(null)} aria-label="Dismiss storage notice"><CloseIcon /></button>
        </div>
      )}

      {newDayReady && showingDaily && (
        <div className="notice notice--accent" role="status">
          <p>A new Daily Bridge is ready.</p>
          <button type="button" className="btn btn--primary btn--small" onClick={goToToday}>Play today’s bridge</button>
        </div>
      )}

      <main id="puzzle" className="main" tabIndex={-1}>
        {puzzle && record ? (
          <>
            <div className="meta">
              <h2 className="meta__title">
                {showingDaily ? `Daily Bridge #${assignment.number}` : 'Practice'}
                <span className="meta__chip">{puzzle.difficulty === 'easy' ? 'Easy · 2 gaps' : 'Standard · 3 gaps'}</span>
              </h2>
              {showingDaily ? (
                <p className="meta__sub">{olderDaily ? 'Finishing yesterday’s bridge' : <span aria-hidden="true">{countdown}</span>}</p>
              ) : (
                <button type="button" className="link-button" onClick={playAgain}>New puzzle</button>
              )}
            </div>
            <p className="instruction">Fill the gaps. Each neighboring pair makes a familiar word or phrase.</p>
            <GameBoard
              key={`${mode}-${showingDaily ? assignment.day : record.puzzleId}`}
              puzzle={puzzle}
              record={record}
              graph={graph}
              mode={mode}
              shareLabel={showingDaily ? { mode: 'daily', number: assignment.number } : { mode: 'practice' }}
              nextDaily={showingDaily && !olderDaily ? countdown : null}
              onRecord={showingDaily ? updateDaily : updatePractice}
              onAnnounce={announce}
              onPlayMore={showingDaily ? (olderDaily ? goToToday : openPractice) : playAgain}
              onSuggest={(from, to) => setSuggestion({ from, to })}
            />
          </>
        ) : (
          <p className="instruction">Loading practice puzzle…</p>
        )}
      </main>

      <footer className="footer">
        <p>A new bridge every day at midnight UTC. Your progress stays in this browser.</p>
      </footer>

      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>

      <Dialog open={dialog === 'help'} title="How to play" onClose={closeDialog} className="dialog--help">
        <Tutorial onDone={closeDialog} />
      </Dialog>
      <Dialog open={dialog === 'stats'} title="Statistics" onClose={closeDialog}>
        <StatsPanel stats={stats} nextDaily={countdown} highlight={todayWinChecks} />
      </Dialog>
      <Dialog open={dialog === 'settings'} title="Settings" onClose={closeDialog}>
        <SettingsPanel
          theme={save.theme}
          onTheme={(theme: Theme) => setSave(current => ({ ...current, theme }))}
          onTutorial={() => setDialog('help')}
          onReset={() => {
            setSave(current => resetSave(current))
            setMode('daily')
            setDailyDay(today)
            setNewDayReady(false)
            setDialog(null)
            announce('All saved data was deleted.')
          }}
        />
      </Dialog>
      <Dialog open={suggestion !== null} title="Suggest a phrase" onClose={() => setSuggestion(null)}>
        {suggestion && <SuggestPanel from={suggestion.from} to={suggestion.to} onAdded={addPhrase} />}
      </Dialog>
    </div>
  )
}
