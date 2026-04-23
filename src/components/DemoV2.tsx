import { useMemo, useState, type CSSProperties } from 'react'
import { Activity, Atom, BarChart3, Database, FlaskConical, Gauge, Search, ShieldCheck, Zap } from 'lucide-react'
import {
  getV2Recommendations,
  modelV2,
  predictV2Material,
  v2ScreeningProjection,
  type TargetsV2,
  type V2Candidate,
} from '../lib/materialsV2'

function format(value: number, digits = 1) {
  return value.toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

function V2Range({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (value: number) => void
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <label className="rangeControl">
      <span>
        <span className="rangeLabel">{label}</span>
        <strong>
          {format(value, step < 1 ? 2 : 0)}
          {unit}
        </strong>
      </span>
      <div className="rangeTrackWrap">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          style={{ '--pct': `${pct}%` } as CSSProperties}
        />
      </div>
    </label>
  )
}

function V2Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="v2Metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  )
}

function ModelQuality({ modelKey, label }: { modelKey: keyof typeof modelV2.models; label: string }) {
  const model = modelV2.models[modelKey]
  const r2 = Math.max(0, Math.min(1, model.metrics.r2))
  return (
    <div className="qualityRow">
      <span>{label}</span>
      <i>
        <b style={{ width: `${r2 * 100}%` }} />
      </i>
      <strong>R² {model.metrics.r2}</strong>
    </div>
  )
}

function scoreTone(score: number) {
  if (score >= 80) return 'good'
  if (score >= 58) return 'warn'
  return 'bad'
}

function V2CandidateRow({
  candidate,
  selected,
  onSelect,
}: {
  candidate: V2Candidate & { score: number }
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button className={`v2Candidate ${selected ? 'selected' : ''}`} type="button" onClick={onSelect}>
      <span className={`v2Score ${scoreTone(candidate.score)}`}>{candidate.score}</span>
      <span className="candidateMain">
        <strong>{candidate.className}</strong>
        <small>{candidate.psmiles}</small>
      </span>
      <span className="v2CandidateProps">
        <b>{format(candidate.pred.tgC, 0)}°C</b>
        <b>{format(candidate.pred.density, 2)}g/cm³</b>
        <b>ε {format(candidate.pred.dielectric, 1)}</b>
        <b>{format(candidate.pred.bandGap, 2)}eV</b>
      </span>
    </button>
  )
}

function V2Property({
  label,
  value,
  unit,
  max,
  target,
}: {
  label: string
  value: number
  unit: string
  max: number
  target?: number
}) {
  const fillPct = Math.min(100, Math.max(0, (value / max) * 100))
  const targetPct = target == null ? null : Math.min(100, Math.max(0, (target / max) * 100))
  return (
    <div className="propertyBar">
      <span>
        <span className="rangeLabel">{label}</span>
        <strong>
          {format(value, Math.abs(value) < 10 ? 2 : 0)}
          {unit}
        </strong>
      </span>
      <div
        className="propertyBarTrack"
        style={{
          '--fill': `${fillPct}%`,
          ...(targetPct != null ? { '--target': `${targetPct}%` } : {}),
        } as CSSProperties}
      >
        <i className="propertyFill" />
        {targetPct != null && <i className="propertyTarget" />}
      </div>
    </div>
  )
}

export default function DemoV2() {
  const [targets, setTargets] = useState<TargetsV2>({
    tgC: 180,
    densityMax: 1.3,
    dielectricMin: 5.5,
    bandGapMin: 4.8,
    stabilityMin: 70,
  })
  const [query, setQuery] = useState('[*]CC(C)(C(=O)Oc1ccc(C)cc1)C[*]')
  const recommendations = useMemo(() => getV2Recommendations(targets), [targets])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = recommendations.find((item) => item.id === selectedId) ?? recommendations[0]
  const projection = v2ScreeningProjection(selected)
  const custom = useMemo(() => predictV2Material(query), [query])

  return (
    <main className="demoV2">
      <header className="v2Topbar">
        <a href="/" className="appHeaderBrand">
          <Atom size={16} />
          <span>Resin MI</span>
        </a>
        <nav>
          <a href="/">demo v1</a>
          <a href="/guide">guide</a>
          <a className="active" href="/demo-v2">demo v2</a>
        </nav>
      </header>

      <section className="v2Hero">
        <div>
          <p className="eyebrow">
            <Database size={15} />
            multi-property learned models
          </p>
          <h1>樹脂物性予測AI demo_v2</h1>
          <p>
            Tgに加えて、密度・誘電率・バンドギャップ・原子化エネルギーも公開データから学習したモデルで予測します。CAE系の値は、これらのML予測物性から作る補助スクリーニングです。
          </p>
        </div>
        <div className="v2HeroMetrics">
          <V2Metric label="Tg training" value={modelV2.models.tgK.trainingRows.toLocaleString('ja-JP')} sub={`MAE ${modelV2.models.tgK.metrics.mae}K`} />
          <V2Metric label="PG rows" value={modelV2.trainingSummary.polymerGenomeRows.toLocaleString('ja-JP')} sub="density / ε / gap / atomization" />
          <V2Metric label="density R²" value={modelV2.models.density.metrics.r2.toString()} sub={`MAE ${modelV2.models.density.metrics.mae}`} />
        </div>
      </section>

      <section className="v2Workspace">
        <aside className="controlPanel">
          <div className="panelTitle">
            <Gauge size={16} />
            <h2>要求特性 v2</h2>
          </div>
          <V2Range label="目標Tg" value={targets.tgC} min={-20} max={260} step={5} unit="°C" onChange={(tgC) => setTargets((c) => ({ ...c, tgC }))} />
          <V2Range label="密度上限" value={targets.densityMax} min={0.9} max={2.0} step={0.01} unit=" g/cm³" onChange={(densityMax) => setTargets((c) => ({ ...c, densityMax }))} />
          <V2Range label="誘電率下限" value={targets.dielectricMin} min={2} max={10} step={0.1} unit="" onChange={(dielectricMin) => setTargets((c) => ({ ...c, dielectricMin }))} />
          <V2Range label="Band gap下限" value={targets.bandGapMin} min={0.5} max={7} step={0.1} unit=" eV" onChange={(bandGapMin) => setTargets((c) => ({ ...c, bandGapMin }))} />
          <V2Range label="安定性下限" value={targets.stabilityMin} min={20} max={95} step={1} unit="/100" onChange={(stabilityMin) => setTargets((c) => ({ ...c, stabilityMin }))} />

          <div className="customPredictor">
            <label htmlFor="v2-psmiles">
              <Search size={14} />
              開発中材料 PSMILES
            </label>
            <textarea id="v2-psmiles" value={query} onChange={(event) => setQuery(event.target.value)} />
            <div className="v2CustomGrid">
              <span>Tg <b>{format(custom.tgC, 0)}°C</b></span>
              <span>Density <b>{format(custom.density, 2)}</b></span>
              <span>ε <b>{format(custom.dielectric, 1)}</b></span>
              <span>Gap <b>{format(custom.bandGap, 2)}eV</b></span>
            </div>
          </div>
        </aside>

        <section className="resultsPanel">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">
                <Zap size={14} />
                ranked by learned properties
              </p>
              <h2>候補材料 v2</h2>
            </div>
            <span>{recommendations.length} candidates</span>
          </div>
          <div className="candidateList">
            {recommendations.map((candidate) => (
              <V2CandidateRow
                key={candidate.id}
                candidate={candidate}
                selected={candidate.id === selected.id}
                onSelect={() => setSelectedId(candidate.id)}
              />
            ))}
          </div>
        </section>

        <section className="detailPanel">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">
                <FlaskConical size={14} />
                learned candidate detail
              </p>
              <h2>ML予測物性</h2>
            </div>
            <span className={`scoreBadge score-${scoreTone(selected.score)}`}>score {selected.score}</span>
          </div>
          <div className="selectedMaterial">
            <strong>{selected.className}</strong>
            <code>{selected.psmiles}</code>
            <p>source {selected.source} · reliability {selected.reliability}</p>
          </div>
          <V2Property label="Tg" value={selected.pred.tgC} max={280} unit="°C" target={targets.tgC} />
          <V2Property label="Density" value={selected.pred.density} max={2.4} unit=" g/cm³" target={targets.densityMax} />
          <V2Property label="Dielectric ε" value={selected.pred.dielectric} max={16} unit="" target={targets.dielectricMin} />
          <V2Property label="Band gap" value={selected.pred.bandGap} max={9.8} unit=" eV" target={targets.bandGapMin} />
          <V2Property label="Atomization" value={Math.abs(selected.pred.atomization)} max={7.2} unit=" eV/atom" />

          <div className="v2Screening">
            <h3>ML物性からの補助スクリーニング</h3>
            <div>
              <V2Metric label="CAE readiness" value={`${format(projection.caeReadiness, 0)}/100`} sub="not a trained CAE model" />
              <V2Metric label="thermal risk" value={`${format(projection.thermalRisk, 0)}/100`} sub="lower is better" />
              <V2Metric label="electrical risk" value={`${format(projection.electricalRisk, 0)}/100`} sub="lower is better" />
              <V2Metric label="mass penalty" value={`${format(projection.massPenalty, 0)}/100`} sub="density derived" />
            </div>
          </div>
        </section>
      </section>

      <section className="v2ModelPanel">
        <div>
          <div className="sectionHeader compact">
            <h2>モデル精度</h2>
            <span>held-out split</span>
          </div>
          <ModelQuality modelKey="tgK" label="Tg" />
          <ModelQuality modelKey="density" label="Density" />
          <ModelQuality modelKey="dielectric" label="Dielectric" />
          <ModelQuality modelKey="bandGap" label="Band gap" />
          <ModelQuality modelKey="atomization" label="Atomization" />
        </div>
        <div>
          <div className="sectionHeader compact">
            <h2>学習データ</h2>
            <span>public datasets</span>
          </div>
          <div className="sourceList">
            <p>
              <ShieldCheck size={15} />
              PolyMetriX: Tg model, {modelV2.trainingSummary.tgRows.toLocaleString('ja-JP')} rows.
            </p>
            <p>
              <BarChart3 size={15} />
              Polymer Genome organic subset: density, dielectric, band gap, atomization, {modelV2.trainingSummary.polymerGenomeRows.toLocaleString('ja-JP')} rows.
            </p>
            <p>
              <Activity size={15} />
              CAE readiness and risks are secondary screening scores calculated from the learned predictions.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
