import { useId } from 'react'
import type { ReactNode, SVGProps } from 'react'
import { CLOUD, CLOUD_PALETTE, DINO_CHEER, DINO_PALETTE, DINO_RUN_A, DINO_RUN_B, EGG, EGG_PALETTE, FERN, FERN_PALETTE } from './sprites.ts'
import type { Palette, Sprite } from './sprites.ts'

/** Pixel-art rectangles, one per horizontal run of same-coloured pixels. */
function runs(sprite: Sprite, palette: Palette, dx = 0, dy = 0): ReactNode[] {
  const out: ReactNode[] = []
  sprite.rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const key = row[x]
      let end = x + 1
      while (end < row.length && row[end] === key) end++
      const fill = palette[key]
      if (fill) out.push(<rect key={`${y}-${x}`} x={x + dx} y={y + dy} width={end - x} height={1} fill={fill} />)
      x = end
    }
  })
  return out
}

type ArtProps = Omit<SVGProps<SVGSVGElement>, 'scale'> & { scale?: number }

/** A whole sprite as its own crisp SVG. */
export function PixelArt({ sprite, palette, scale = 3, ...props }: ArtProps & { sprite: Sprite; palette: Palette }) {
  return (
    <svg
      viewBox={`0 0 ${sprite.width} ${sprite.height}`} width={sprite.width * scale} height={sprite.height * scale}
      shapeRendering="crispEdges" aria-hidden="true" focusable="false" {...props}
    >
      {runs(sprite, palette)}
    </svg>
  )
}

/** A sprite placed inside another pixel SVG, in that SVG's pixel units. */
export function SpriteAt({ sprite, palette, x, y }: { sprite: Sprite; palette: Palette; x: number; y: number }) {
  return <g>{runs(sprite, palette, x, y)}</g>
}

export const DINO_SIZE = { width: DINO_RUN_A.width, height: DINO_RUN_A.height }

/**
 * Dash the raptor. Both running frames are drawn and CSS flips between them (.dino--run); with reduced
 * motion only the first frame shows.
 */
export function Dino({ pose = 'run', scale = 3, className = '', ...props }: ArtProps & { pose?: 'run' | 'stand' | 'cheer' }) {
  const { width, height } = DINO_SIZE
  return (
    <svg
      className={`dino dino--${pose} ${className}`.trim()} viewBox={`0 0 ${width} ${height}`}
      width={width * scale} height={height * scale} shapeRendering="crispEdges" aria-hidden="true" focusable="false" {...props}
    >
      {pose === 'cheer' ? (
        <g>{runs(DINO_CHEER, DINO_PALETTE)}</g>
      ) : (
        <>
          <g className="dino__frame dino__frame--a">{runs(DINO_RUN_A, DINO_PALETTE)}</g>
          {pose === 'run' && <g className="dino__frame dino__frame--b">{runs(DINO_RUN_B, DINO_PALETTE)}</g>}
        </>
      )}
    </svg>
  )
}

export function Cloud(props: ArtProps) {
  return <PixelArt sprite={CLOUD} palette={CLOUD_PALETTE} {...props} />
}

export type LandDecor = 'none' | 'fern' | 'ferns' | 'egg'

/**
 * A chunk of land seen from the side: a grass cap over checkered earth, drawn in pixel units at (x, y).
 * `width` and `height` are in pixels; the bottom is meant to sit below the waterline.
 */
export function LandChunk({ x, y, width, height, decor = 'none', patternId }: {
  x: number
  y: number
  width: number
  height: number
  decor?: LandDecor
  patternId: string
}) {
  const w = Math.max(6, Math.round(width))
  const h = Math.max(6, Math.round(height))
  const fringe: ReactNode[] = []
  for (let i = 2; i < w - 2; i += 2) {
    const drop = i % 6 === 0 ? 2 : 1
    fringe.push(<rect key={i} x={x + i} y={y + 4} width={1} height={drop} className="land__grass" />)
  }
  const tufts: ReactNode[] = []
  for (let i = 3; i < w - 3; i += 7) tufts.push(<rect key={i} x={x + i} y={y + 1} width={2} height={1} className="land__grass-light" />)
  return (
    <g className="land">
      {/* Outline: stepped top corners, straight sides down into the sea. */}
      <path className="land__outline" d={`M${x + 2} ${y}h${w - 4}v1h1v1h1v${h - 2}h${-w}v${-(h - 2)}h1v-1h1z`} />
      <rect x={x + 1} y={y + 4} width={w - 2} height={h - 4} fill={`url(#${patternId})`} />
      <rect className="land__shade" x={x + w - 3} y={y + 4} width={2} height={h - 4} />
      <path className="land__grass" d={`M${x + 2} ${y + 1}h${w - 4}v1h1v2h${-(w - 2)}v-2h1z`} />
      <rect className="land__grass-dark" x={x + 1} y={y + 3} width={w - 2} height={1} />
      {fringe}
      {tufts}
      {decor === 'fern' && <SpriteAt sprite={FERN} palette={FERN_PALETTE} x={x + Math.round(w * 0.62) - 6} y={y - FERN.height + 1} />}
      {decor === 'ferns' && (
        <>
          <SpriteAt sprite={FERN} palette={FERN_PALETTE} x={x + Math.round(w * 0.3) - 6} y={y - FERN.height + 1} />
          <SpriteAt sprite={FERN} palette={FERN_PALETTE} x={x + Math.round(w * 0.72) - 6} y={y - FERN.height + 1} />
        </>
      )}
      {decor === 'egg' && (
        <>
          <SpriteAt sprite={FERN} palette={FERN_PALETTE} x={x + Math.round(w * 0.25) - 6} y={y - FERN.height + 1} />
          <SpriteAt sprite={EGG} palette={EGG_PALETTE} x={x + Math.round(w * 0.6) - 3} y={y - EGG.height + 1} />
        </>
      )}
    </g>
  )
}

/** The checkered earth pattern used by every LandChunk in one SVG. Render once inside <defs>. */
export function EarthPattern({ id }: { id: string }) {
  return (
    <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse">
      <rect className="land__earth-a" width="8" height="8" />
      <rect className="land__earth-b" width="4" height="4" />
      <rect className="land__earth-b" x="4" y="4" width="4" height="4" />
    </pattern>
  )
}

export function usePatternId(): string {
  return `earth${useId().replace(/[^a-zA-Z0-9]/g, '')}`
}
