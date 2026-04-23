import { modelData } from '../lib/materials'

export function Histogram() {
  const max = Math.max(...modelData.histogram.map((bin) => bin.count))
  return (
    <div className="histogram" aria-label="Predicted Tg distribution">
      {modelData.histogram.map((bin) => (
        <div className="barSlot" key={`${bin.from}-${bin.to}`}>
          <span className="bar" style={{ height: `${Math.max(4, (bin.count / max) * 100)}%` }} />
          <small>{Math.round(bin.from)}</small>
        </div>
      ))}
    </div>
  )
}

export function ScatterPlot() {
  const points = modelData.evalPoints
  const values = points.flatMap((point) => [point.actual, point.predicted])
  const min = Math.min(...values) - 16
  const max = Math.max(...values) + 16
  const scale = (value: number) => ((value - min) / (max - min)) * 100
  return (
    <svg className="scatter" viewBox="0 0 100 100" role="img" aria-label="Model actual versus predicted Tg">
      <line x1="8" y1="8" x2="8" y2="92" className="guide-axis" />
      <line x1="8" y1="92" x2="92" y2="92" className="guide-axis" />
      <line x1="8" y1="92" x2="92" y2="8" className="guide" strokeDasharray="3 2" />
      {points.map((point, index) => (
        <circle
          key={`${point.actual}-${point.predicted}-${index}`}
          cx={scale(point.actual)}
          cy={100 - scale(point.predicted)}
          r="1.3"
          className="point"
        />
      ))}
    </svg>
  )
}

export function MoleculeField() {
  const nodes: [number, number, boolean][] = [
    [10, 44, true],
    [22, 26, false],
    [36, 40, false],
    [50, 22, true],
    [66, 36, false],
    [78, 18, false],
    [88, 48, true],
    [72, 66, false],
    [54, 58, false],
    [38, 74, true],
    [22, 66, false],
  ]
  return (
    <svg className="moleculeField" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M10 44 L22 26 L36 40 L50 22 L66 36 L78 18 L88 48 L72 66 L54 58 L38 74 L22 66 Z" />
      {nodes.map(([cx, cy, large], index) => (
        <g key={index}>
          <circle
            cx={cx}
            cy={cy}
            r={large ? 5.8 : 4.2}
            className="node-ring"
            style={{ animationDelay: `${index * 0.4}s` }}
          />
          <circle
            cx={cx}
            cy={cy}
            r={large ? 2.8 : 1.8}
            className="node-core"
            style={{ animationDelay: `${index * 0.4}s` }}
          />
        </g>
      ))}
    </svg>
  )
}
