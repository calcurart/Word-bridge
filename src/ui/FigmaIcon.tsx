import type { CSSProperties } from 'react'
import arrowButton from '../assets/icons/arrow-button.svg'
import arrowLink from '../assets/icons/arrow-link.svg'
import arrowSmall from '../assets/icons/arrow-small.svg'
import bridge from '../assets/icons/bridge.svg'
import checkExample from '../assets/icons/check-example.svg'
import checkLink from '../assets/icons/check-link.svg'
import checkList from '../assets/icons/check-list.svg'
import checkWord from '../assets/icons/check-word.svg'
import chevronRight from '../assets/icons/chevron-right.svg'
import clock from '../assets/icons/clock.svg'
import enter from '../assets/icons/enter.svg'
import help from '../assets/icons/help.svg'
import hint from '../assets/icons/hint.svg'
import history from '../assets/icons/history.svg'
import lock from '../assets/icons/lock.svg'
import settings from '../assets/icons/settings.svg'
import spark from '../assets/icons/spark.svg'
import stats from '../assets/icons/stats.svg'
import sun from '../assets/icons/sun.svg'

// Icons from the Figma design (src/assets/icons), each at its design size. They're drawn as a CSS mask filled
// with the current text colour, so the same artwork follows the light and dark themes.

export const FIGMA_ICONS = {
  arrowButton: { src: arrowButton, size: 18 },
  arrowLink: { src: arrowLink, size: 17 },
  arrowSmall: { src: arrowSmall, size: 14 },
  bridge: { src: bridge, size: 25 },
  checkExample: { src: checkExample, size: 13 },
  checkLink: { src: checkLink, size: 12 },
  checkList: { src: checkList, size: 15 },
  checkWord: { src: checkWord, size: 16 },
  chevronRight: { src: chevronRight, size: 14 },
  clock: { src: clock, size: 16 },
  enter: { src: enter, size: 13 },
  help: { src: help, size: 20 },
  hint: { src: hint, size: 18 },
  history: { src: history, size: 14 },
  lock: { src: lock, size: 14 },
  settings: { src: settings, size: 20 },
  spark: { src: spark, size: 16 },
  stats: { src: stats, size: 20 },
  sun: { src: sun, size: 18 },
} as const

export type FigmaIconName = keyof typeof FIGMA_ICONS

export function FigmaIcon({ name, className = '' }: { name: FigmaIconName; className?: string }) {
  const { src, size } = FIGMA_ICONS[name]
  const style = { '--icon': `url("${src}")`, width: size, height: size } as CSSProperties
  return <span className={`ficon ${className}`.trim()} style={style} aria-hidden="true" />
}
