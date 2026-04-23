import { useMemo, useState } from 'react'
import {
  Atom,
  Beaker,
  Boxes,
  CircuitBoard,
  FlaskConical,
  Gauge,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import './App.css'
import { Histogram, MoleculeField, ScatterPlot } from './components/Charts'
import {
  caeProjection,
  getRecommendations,
  modelData,
  predictCustomMaterial,
  type MaterialCandidate,
  type Targets,
} from './lib/materials'

const applicationOptions = [
  { id: 'connector', label: '電子部材', icon: CircuitBoard },
  { id: 'battery', label: '熱管理', icon: Gauge },
  { id: 'gear', label: '摺動部品', icon: Boxes },
  { id: 'thinwall', label: '薄肉成形', icon: FlaskConical },
] as const

function format(value: number, digits = 1) {
  return value.toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

function RangeControl({
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
  return (
    <label className="rangeControl">
      <span>
        {label}
        <strong>
          {format(value, step < 1 ? 2 : 0)}
          {unit}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'warm' | 'cool' }) {
  return (
    <div className={`metric ${tone ?? ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function CandidateRow({
  candidate,
  selected,
  onSelect,
}: {
  candidate: MaterialCandidate & { score: number }
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button className={`candidate ${selected ? 'selected' : ''}`} type="button" onClick={onSelect}>
      <span className="score">{candidate.score}</span>
      <span className="candidateMain">
        <strong>{candidate.className}</strong>
        <small>{candidate.psmiles}</small>
      </span>
      <span className="candidateProps">
        <b>{format(candidate.predTgC, 0)}C</b>
        <b>{format(candidate.props.modulus, 2)}GPa</b>
        <b>{format(candidate.props.density, 2)}</b>
      </span>
    </button>
  )
}

function PropertyBar({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  return (
    <div className="propertyBar">
      <span>
        {label}
        <strong>
          {format(value, value < 10 ? 2 : 0)}
          {unit}
        </strong>
      </span>
      <i style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  )
}

function App() {
  const [targets, setTargets] = useState<Targets>({
    tgC: 140,
    modulus: 2.8,
    density: 1.28,
    resistance: 72,
    processability: 48,
    application: 'battery',
  })
  const [query, setQuery] = useState('[*]CC(C)(C(=O)Oc1ccc(C)cc1)C[*]')
  const recommendations = useMemo(() => getRecommendations(targets), [targets])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = recommendations.find((item) => item.id === selectedId) ?? recommendations[0]
  const projection = caeProjection(selected, targets)
  const custom = useMemo(() => predictCustomMaterial(query), [query])

  return (
    <main>
      <section className="heroBand">
        <div className="heroText">
          <p className="eyebrow">
            <Atom size={16} />
            Materials Informatics resin selector
          </p>
          <h1>樹脂物性予測AI デモ</h1>
          <p>
            公開ポリマーTgデータで学習した軽量モデルを使い、必要物性から候補樹脂を探索し、部材CAEに渡す前の選定を支援する体験にしています。
          </p>
        </div>
        <div className="heroVisual">
          <MoleculeField />
          <Metric label="training rows" value={modelData.trainingRows.toLocaleString('ja-JP')} />
          <Metric label="test MAE" value={`${modelData.metrics.maeK}K`} tone="warm" />
          <Metric label="classes" value={Object.keys(modelData.classCounts).length.toString()} tone="cool" />
        </div>
      </section>

      <section className="workspace">
        <aside className="controlPanel">
          <div className="panelTitle">
            <SlidersHorizontal size={18} />
            <h2>要求特性</h2>
          </div>
          <div className="segmented">
            {applicationOptions.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={targets.application === id ? 'active' : ''}
                type="button"
                onClick={() => setTargets((current) => ({ ...current, application: id }))}
                title={label}
              >
                <Icon size={17} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <RangeControl
            label="目標Tg"
            value={targets.tgC}
            min={-20}
            max={260}
            step={5}
            unit="C"
            onChange={(tgC) => setTargets((current) => ({ ...current, tgC }))}
          />
          <RangeControl
            label="弾性率下限"
            value={targets.modulus}
            min={0.5}
            max={6}
            step={0.1}
            unit="GPa"
            onChange={(modulus) => setTargets((current) => ({ ...current, modulus }))}
          />
          <RangeControl
            label="密度上限"
            value={targets.density}
            min={0.9}
            max={1.7}
            step={0.01}
            unit="g/cm3"
            onChange={(density) => setTargets((current) => ({ ...current, density }))}
          />
          <RangeControl
            label="耐薬品性"
            value={targets.resistance}
            min={20}
            max={95}
            step={1}
            unit="/100"
            onChange={(resistance) => setTargets((current) => ({ ...current, resistance }))}
          />
          <RangeControl
            label="成形しやすさ"
            value={targets.processability}
            min={20}
            max={90}
            step={1}
            unit="/100"
            onChange={(processability) => setTargets((current) => ({ ...current, processability }))}
          />
          <div className="customPredictor">
            <label htmlFor="psmiles">
              <Search size={16} />
              開発中材料 PSMILES
            </label>
            <textarea id="psmiles" value={query} onChange={(event) => setQuery(event.target.value)} />
            <div className="customResult">
              <strong>{format(custom.predTgC, 0)}C</strong>
              <span>Tg予測</span>
              <strong>{format(custom.props.modulus, 2)}GPa</strong>
              <span>弾性率目安</span>
            </div>
          </div>
        </aside>

        <section className="resultsPanel">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">
                <Sparkles size={15} />
                ranked by target fit
              </p>
              <h2>候補材料</h2>
            </div>
            <span>{recommendations.length} candidates</span>
          </div>
          <div className="candidateList">
            {recommendations.map((candidate) => (
              <CandidateRow
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
                <Beaker size={15} />
                candidate detail
              </p>
              <h2>選定根拠</h2>
            </div>
            <span>score {selected.score}</span>
          </div>
          <div className="selectedMaterial">
            <strong>{selected.className}</strong>
            <code>{selected.psmiles}</code>
            <p>
              source {selected.source} / reliability {selected.reliability}
            </p>
          </div>
          <PropertyBar label="Tg" value={selected.predTgC} max={280} unit="C" />
          <PropertyBar label="弾性率" value={selected.props.modulus} max={7.2} unit="GPa" />
          <PropertyBar label="耐薬品性" value={selected.props.chemicalResistance} max={100} unit="/100" />
          <PropertyBar label="成形しやすさ" value={selected.props.processability} max={100} unit="/100" />
          <div className="caeBox">
            <h3>CAE 連携目安</h3>
            <div>
              <Metric label="fit" value={`${format(projection.caeFit, 0)}/100`} />
              <Metric label="thermal margin" value={`${format(projection.thermalMargin, 0)}C`} />
              <Metric label="warp risk" value={`${format(projection.warpRisk, 0)}/100`} tone="warm" />
              <Metric label="deflection risk" value={`${format(projection.deflectionRisk, 0)}/100`} tone="cool" />
            </div>
          </div>
        </section>
      </section>

      <section className="modelPanel">
        <div>
          <div className="sectionHeader compact">
            <h2>学習データ分布</h2>
            <span>PolyMetriX / Zenodo</span>
          </div>
          <Histogram />
        </div>
        <div>
          <div className="sectionHeader compact">
            <h2>予測精度サンプル</h2>
            <span>test split</span>
          </div>
          <ScatterPlot />
        </div>
      </section>
    </main>
  )
}

export default App
