import { modelData } from '../lib/materials'

export function Histogram() {
  const max = Math.max(...modelData.histogram.map((bin) => bin.count))
  return (
    <div className="histogram" aria-label="Predicted Tg distribution">
      {modelData.histogram.map((bin) => (
        <div className="barSlot" key={`${bin.from}-${bin.to}`}>
          <span className="bar" style={{ height: `${Math.max(6, (bin.count / max) * 100)}%` }} />
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
      <line x1="8" y1="92" x2="92" y2="8" className="guide" />
      {points.map((point, index) => (
        <circle
          key={`${point.actual}-${point.predicted}-${index}`}
          cx={scale(point.actual)}
          cy={100 - scale(point.predicted)}
          r="1.4"
          className="point"
        />
      ))}
    </svg>
  )
}

export function MoleculeField() {
  const nodes = [
    [10, 44],
    [22, 26],
    [36, 40],
    [50, 22],
    [66, 36],
    [78, 18],
    [88, 48],
    [72, 66],
    [54, 58],
    [38, 74],
    [22, 66],
  ]
  return (
    <svg className="moleculeField" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M10 44 L22 26 L36 40 L50 22 L66 36 L78 18 L88 48 L72 66 L54 58 L38 74 L22 66 Z" />
      {nodes.map(([cx, cy], index) => (
        <circle key={index} cx={cx} cy={cy} r={index % 3 === 0 ? 4.8 : 3.4} />
      ))}
    </svg>
  )
}
