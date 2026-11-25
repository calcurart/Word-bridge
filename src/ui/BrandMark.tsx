// The Word Bridge mark: a "W" drawn as a suspension bridge (from the Word Bridge logo design canvas).
// Drawn in currentColor so CSS sets its colour.

const HANGERS: Array<[number, number]> = [
  [28.0, 40.9], [38.1, 63.8], [48.3, 78.4], [58.5, 85.0], [68.8, 83.4], [79.1, 73.8], [89.5, 55.9],
  [110.5, 55.9], [120.9, 73.8], [131.2, 83.4], [141.5, 85.0], [151.7, 78.4], [161.9, 63.8], [172.0, 40.9],
]

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 130" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <polygon points="13,6 22,6 39,120 30,120" />
        <rect x="95.5" y="26" width="9" height="94" rx="1" />
        <polygon points="178,6 187,6 170,120 161,120" />
        <rect x="0" y="95" width="200" height="10" rx="2" />
      </g>
      <path d="M18 9 Q58 150 100 29 Q142 150 182 9" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        {HANGERS.map(([x, y]) => <line key={x} x1={x} y1={y} x2={x} y2={96} />)}
      </g>
    </svg>
  )
}
