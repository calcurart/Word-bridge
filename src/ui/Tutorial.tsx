import { Fragment, useEffect, useRef, useState } from 'react'
import { TUTORIAL } from '../data/puzzles.ts'
import { MAX_CHECKS } from '../lib/game.ts'
import { CheckIcon, CrossIcon } from './icons.tsx'

const WORDS = [TUTORIAL.start, ...TUTORIAL.solution, TUTORIAL.end].map(word => word.toUpperCase())
const PHRASES = ['sunflower', 'flower pot', 'pothole']

type Step = { title: string; body: string; shown: number; lit: number; kind?: 'order' | 'rules' }

// shown: how many gap words are filled in; lit: how many links are marked recognised.
const STEPS: readonly Step[] = [
  { title: 'Build a bridge of words', body: 'Fill the gaps. Each neighboring pair makes a familiar word or phrase.', shown: 0, lit: 0 },
  { title: 'SUN + FLOWER', body: 'Together they make “sunflower”, so that link holds.', shown: 1, lit: 1 },
  { title: 'FLOWER + POT', body: '“Flower pot” works too. Two-word phrases count, not only single words.', shown: 2, lit: 2 },
  { title: 'POT + HOLE', body: '“Pothole” finishes it. Every link is recognized, so the bridge is complete.', shown: 2, lit: 3 },
  { title: 'Order matters', body: 'Pairs read left to right, or top to bottom on a phone. Try swapping them.', shown: 2, lit: 3, kind: 'order' },
  { title: 'Good to know', body: '', shown: 2, lit: 3, kind: 'rules' },
]

export function Tutorial({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [swapped, setSwapped] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const first = useRef(true)
  const current = STEPS[step]
  const last = step === STEPS.length - 1

  useEffect(() => {
    // Keep keyboard and screen reader users on the new step's text (but leave initial focus alone).
    if (first.current) { first.current = false; return }
    heading.current?.focus()
  }, [step])

  return (
    <div className="tutorial">
      <p className="tutorial__progress" aria-hidden="true">
        {STEPS.map((_, index) => <span key={index} className={`tutorial__dot${index === step ? ' tutorial__dot--on' : ''}`} />)}
      </p>
      <h3 className="tutorial__title" ref={heading} tabIndex={-1}>
        <span className="sr-only">Step {step + 1} of {STEPS.length}: </span>{current.title}
      </h3>

      {current.kind === 'order' ? (
        <div className="mini" aria-live="polite">
          <MiniWord key={swapped ? 'pot-a' : 'flower-a'} word={swapped ? 'POT' : 'FLOWER'} gap />
          <MiniLink key={String(swapped)} ok={!swapped} fresh />
          <MiniWord key={swapped ? 'flower-b' : 'pot-b'} word={swapped ? 'FLOWER' : 'POT'} gap />
          <p className={`mini__caption ${swapped ? 'mini__caption--bad' : 'mini__caption--good'}`}>
            {swapped
              ? <><CrossIcon width="15" height="15" /> POT + FLOWER: Not in this game’s dictionary</>
              : <><CheckIcon width="15" height="15" /> FLOWER + POT = flower pot</>}
          </p>
        </div>
      ) : current.kind !== 'rules' ? (
        <div className="mini" role="img" aria-label={miniLabel(current)}>
          {WORDS.map((word, index) => {
            const isGap = index > 0 && index < WORDS.length - 1
            const visible = !isGap || index <= current.shown
            return (
              <Fragment key={word}>
                {index > 0 && <MiniLink ok={index <= current.lit ? true : null} fresh={index === current.lit} />}
                <MiniWord word={visible ? word : ''} gap={isGap} />
              </Fragment>
            )
          })}
          {current.lit > 0 && (
            <p className="mini__caption mini__caption--good" aria-hidden="true">
              <CheckIcon width="15" height="15" /> {WORDS[current.lit - 1]} + {WORDS[current.lit]} = {PHRASES[current.lit - 1]}
            </p>
          )}
        </div>
      ) : null}

      {current.kind === 'rules' ? (
        <ul className="tutorial__rules">
          <li><strong>One word per gap.</strong> Capitals and extra spaces don’t matter.</li>
          <li><strong>More than one bridge may work.</strong> Any bridge whose links are all recognized wins.</li>
          <li><strong>Feedback is about links, not words.</strong> After a check each link shows <span className="inline-good"><CheckIcon width="13" height="13" /> recognized</span> or <span className="inline-bad"><CrossIcon width="13" height="13" /> not in this game’s dictionary</span>. A word can fit on one side and not the other.</li>
          <li><strong>The dictionary is curated.</strong> It holds familiar compounds and phrases, so a real expression may still be missing. You can suggest it.</li>
          <li><strong>{MAX_CHECKS} checks per puzzle.</strong> Incomplete or repeated bridges don’t use one. Up to two hints can each reveal a word.</li>
        </ul>
      ) : (
        <p className="tutorial__body">{current.body}</p>
      )}

      {current.kind === 'order' && (
        <button type="button" className="btn btn--quiet btn--small" onClick={() => setSwapped(value => !value)} aria-pressed={swapped}>
          {swapped ? 'Swap back' : 'Swap the order'}
        </button>
      )}

      <div className="tutorial__nav">
        <button type="button" className="btn btn--quiet" onClick={() => setStep(step - 1)} disabled={step === 0}>Back</button>
        <button type="button" className="btn btn--primary" onClick={() => (last ? onDone() : setStep(step + 1))}>
          {last ? 'Start playing' : 'Next'}
        </button>
      </div>
    </div>
  )
}

function miniLabel(step: Step): string {
  const words = WORDS.map((word, index) => (index > 0 && index < WORDS.length - 1 && index > step.shown ? 'blank' : word))
  return `Example bridge: ${words.join(', ')}.${step.lit > 0 ? ` ${step.lit} of 3 links recognized.` : ''}`
}

function MiniWord({ word, gap = false }: { word: string; gap?: boolean }) {
  return <span className={`mini__word${gap ? ' mini__word--gap' : ''}${word ? '' : ' mini__word--empty'}`}>{word || '?'}</span>
}

function MiniLink({ ok, fresh = false }: { ok: boolean | null; fresh?: boolean }) {
  const state = ok === true ? ' mini__link--good' : ok === false ? ' mini__link--bad' : ''
  return (
    <span className={`mini__link${state}${fresh ? ' mini__link--fresh' : ''}`} aria-hidden="true">
      {ok === true && <CheckIcon width="12" height="12" />}
      {ok === false && <CrossIcon width="12" height="12" />}
    </span>
  )
}
