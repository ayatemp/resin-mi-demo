import { useMemo, useState, type CSSProperties } from 'react'
import {
  Atom,
  ArrowLeft,
  Beaker,
  BookOpen,
  Boxes,
  CircuitBoard,
  FlaskConical,
  Gauge,
  HelpCircle,
  Search,
  SlidersHorizontal,
  Sparkles,
  Thermometer,
} from 'lucide-react'
import './App.css'
import { Histogram, MoleculeField, ScatterPlot } from './components/Charts'
import DemoV2 from './components/DemoV2'
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

function ScoreRing({ score }: { score: number }) {
  const r = 15
  const circ = 2 * Math.PI * r
  const fill = (score / 100) * circ
  const hue = Math.round(160 + (score / 100) * -40)
  const color = `hsl(${hue}, 80%, 55%)`
  return (
    <svg className="scoreRing" width="44" height="44" viewBox="0 0 44 44" aria-label={`score ${score}`}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="2.5" />
      <circle
        cx="22" cy="22" r={r}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={`${fill} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="26.5" textAnchor="middle" fontSize="10.5" fontWeight="700" fill={color} fontFamily="'JetBrains Mono', monospace">
        {score}
      </text>
    </svg>
  )
}

function AppHeader({
  targets,
  setTargets,
}: {
  targets: Targets
  setTargets: React.Dispatch<React.SetStateAction<Targets>>
}) {
  return (
    <header className="appHeader">
      <div className="appHeaderBrand">
        <Atom size={16} />
        <span>樹脂MI デモ</span>
      </div>
      <nav className="appPresets" aria-label="用途プリセット">
        {applicationOptions.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={targets.application === id ? 'active' : ''}
            type="button"
            onClick={() => setTargets((c) => ({ ...c, application: id }))}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <a className="guideLink" href="/guide">
        <HelpCircle size={14} />
        <span>ガイド</span>
      </a>
      <a className="guideLink" href="/demo-v2">
        <Sparkles size={14} />
        <span>demo v2</span>
      </a>
    </header>
  )
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
        <span className="rangeBounds">
          <small>{min}{unit}</small>
          <small>{max}{unit}</small>
        </span>
      </div>
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

function CaeMetric({
  label,
  value,
  maxVal,
  mode,
}: {
  label: string
  value: number
  maxVal: number
  mode: 'fit' | 'risk'
}) {
  const pct = Math.min(100, (value / maxVal) * 100)
  const status = mode === 'fit'
    ? value >= 70 ? 'good' : value >= 40 ? 'warn' : 'bad'
    : value < 30 ? 'good' : value < 60 ? 'warn' : 'bad'
  return (
    <div className={`caeMetric status-${status}`}>
      <div className="caeMetricTop">
        <span>{label}</span>
        <strong>{format(value, 0)}<small>/{maxVal}</small></strong>
      </div>
      <div className="caeBar">
        <i style={{ width: `${pct}%` } as CSSProperties} />
      </div>
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
      <ScoreRing score={candidate.score} />
      <span className="candidateMain">
        <strong>{candidate.className}</strong>
        <small>{candidate.psmiles}</small>
      </span>
      <span className="candidateProps">
        <b title="予測Tg">{format(candidate.predTgC, 0)}°C</b>
        <b title="弾性率目安">{format(candidate.props.modulus, 2)}GPa</b>
        <b title="密度目安">{format(candidate.props.density, 2)}<small>g/cm³</small></b>
      </span>
    </button>
  )
}

function PropertyBar({
  label,
  value,
  max,
  unit,
  target,
}: {
  label: string
  value: number
  max: number
  unit: string
  target?: number
}) {
  const fillPct = Math.min(100, (value / max) * 100)
  const targetPct = target != null ? Math.min(100, (target / max) * 100) : null
  const style: CSSProperties & Record<string, string> = {
    '--fill': `${fillPct}%`,
    ...(targetPct != null ? { '--target': `${targetPct}%` } : {}),
  }
  return (
    <div className="propertyBar">
      <span>
        <span className="rangeLabel">{label}</span>
        <strong>
          {format(value, value < 10 ? 2 : 0)}
          {unit}
        </strong>
      </span>
      <div className="propertyBarTrack" style={style}>
        <i className="propertyFill" />
        {targetPct != null && <i className="propertyTarget" />}
      </div>
    </div>
  )
}

function GuidePage() {
  return (
    <main className="guidePage">
      <section className="guideHero">
        <a className="backLink" href="/">
          <ArrowLeft size={16} />
          デモに戻る
        </a>
        <p className="eyebrow">
          <BookOpen size={16} />
          How to read this demo
        </p>
        <h1>樹脂MIデモの見方</h1>
        <p>
          このページは、候補材料に表示される数値と、左側の要求特性、右側の選定根拠が何を意味しているかを説明する補助ページです。
        </p>
      </section>

      <section className="guideGrid">
        <article className="guideBlock wide">
          <h2>候補材料の1行に出てくる数値</h2>
          <div className="sampleCandidate" aria-label="candidate row example">
            <ScoreRing score={99} />
            <span className="candidateMain">
              <strong>Polyimines</strong>
              <small>[*]CCN([*])C(=O)C12CC3CC(CC(C3)C1)C2</small>
            </span>
            <span className="candidateProps">
              <b>140°C</b>
              <b>4.46GPa</b>
              <b>1.08<small>g/cm³</small></b>
            </span>
          </div>
          <dl className="definitionList">
            <div>
              <dt>スコアリング（リング）</dt>
              <dd>
                要求特性との適合スコアです。100に近いほど左側で指定した目標Tg・弾性率・密度・耐薬品性・成形しやすさに合っています。リングの色は高得点ほど青緑、低得点ほど赤寄りになります。
              </dd>
            </div>
            <div>
              <dt>材料クラス</dt>
              <dd>Polyimides、Polyesters、Polysiloxanes などのポリマー分類です。個別の商品名ではありません。</dd>
            </div>
            <div>
              <dt>PSMILES</dt>
              <dd>ポリマーの繰り返し単位を表す文字列です。AIが特徴量化するための入力として使っています。</dd>
            </div>
            <div>
              <dt>140°C</dt>
              <dd>予測Tg（ガラス転移温度）です。公開Tgデータで学習したモデルの出力を摂氏で表示しています。</dd>
            </div>
            <div>
              <dt>4.46GPa</dt>
              <dd>弾性率の目安。TgとPSMILES構造特徴から推定した値で、CAE投入前の仮置き値です。</dd>
            </div>
            <div>
              <dt>1.08 g/cm³</dt>
              <dd>密度の目安です。軽量化要件の確認に使います。</dd>
            </div>
          </dl>
        </article>

        <article className="guideBlock">
          <h2>demo_v2 について</h2>
          <div className="guideCallout">
            <Sparkles size={18} />
            <p>
              demo_v2では、Tg・密度・誘電率・バンドギャップ・原子化エネルギーを公開データから学習したモデルで予測します。
            </p>
          </div>
          <p>
            V2ページは <a className="inlineLink" href="/demo-v2">/demo-v2</a> または <a className="inlineLink" href="/demo_ver2">/demo_ver2</a> で開けます。CAE readinessやriskは、学習済み物性を使った二次スクリーニング指標で、CAE解析そのものを学習したモデルではありません。
          </p>
        </article>

        <article className="guideBlock">
          <h2>左側の要求特性</h2>
          <p>
            スライダーを動かすと候補材料のスコアと順位がリアルタイムに変わります。上部の用途ボタンでTg・剛性・軽量性・成形性の重みも変わります。プロパティバーの縦線はあなたが設定した目標値です。
          </p>
          <ul>
            <li><strong>目標Tg</strong>: 耐熱性の中心条件</li>
            <li><strong>弾性率下限</strong>: 剛性として最低限ほしい値</li>
            <li><strong>密度上限</strong>: 軽量化のために超えたくない値</li>
            <li><strong>耐薬品性</strong>: 0〜100のデモ指標</li>
            <li><strong>成形しやすさ</strong>: 0〜100のデモ指標</li>
          </ul>
        </article>

        <article className="guideBlock">
          <h2>右側の選定根拠</h2>
          <p>
            候補をクリックすると詳細表示に切り替わります。プロパティバーの縦マーカーが目標値、塗り部分が実測予測値です。CAE指標の色は信号機方式です。
          </p>
          <ul>
            <li><strong>緑</strong>: 問題なし</li>
            <li><strong>黄</strong>: 要注意</li>
            <li><strong>赤</strong>: 要検討</li>
          </ul>
        </article>

        <article className="guideBlock">
          <h2>CAE連携目安</h2>
          <p>実際のCAE解析ではありません。材料候補をCAEに渡す前の事前スクリーニング指標です。</p>
          <ul>
            <li><strong>fit</strong>: CAE投入候補としての総合目安</li>
            <li><strong>thermal margin</strong>: HDT目安と目標Tgの差</li>
            <li><strong>warp risk</strong>: 反りや成形不安定さの目安</li>
            <li><strong>deflection risk</strong>: 剛性不足によるたわみリスク</li>
          </ul>
        </article>

        <article className="guideBlock">
          <h2>学習している値と推定値</h2>
          <div className="guideCallout">
            <Thermometer size={18} />
            <p>
              V1ではTgを公開データから学習しています。弾性率・密度・耐薬品性・成形性・CAE指標はTgとPSMILES構造特徴から作ったデモ用推定値です。V2では密度・誘電率・バンドギャップなども別モデルで学習しています。
            </p>
          </div>
          <p>
            実材料開発では社内実測データとCAE実測結果で追加学習・検証が必要です。
          </p>
        </article>
      </section>
    </main>
  )
}

function MainDemo() {
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
    <>
      <AppHeader targets={targets} setTargets={setTargets} />
      <main>
        <section className="heroBand">
          <div className="heroText">
            <p className="eyebrow">
              <Atom size={15} />
              Materials Informatics resin selector
            </p>
            <h1>樹脂物性予測AI</h1>
            <p>
              公開ポリマーTgデータで学習した軽量モデルで候補樹脂を探索し、部材CAEへの橋渡しを体験できます。上部のタブで用途を切り替えると最適化の重みが変わります。
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
              <SlidersHorizontal size={16} />
              <h2>要求特性</h2>
            </div>
            <RangeControl
              label="目標Tg"
              value={targets.tgC}
              min={-20}
              max={260}
              step={5}
              unit="°C"
              onChange={(tgC) => setTargets((c) => ({ ...c, tgC }))}
            />
            <RangeControl
              label="弾性率下限"
              value={targets.modulus}
              min={0.5}
              max={6}
              step={0.1}
              unit=" GPa"
              onChange={(modulus) => setTargets((c) => ({ ...c, modulus }))}
            />
            <RangeControl
              label="密度上限"
              value={targets.density}
              min={0.9}
              max={1.7}
              step={0.01}
              unit=" g/cm³"
              onChange={(density) => setTargets((c) => ({ ...c, density }))}
            />
            <RangeControl
              label="耐薬品性"
              value={targets.resistance}
              min={20}
              max={95}
              step={1}
              unit="/100"
              onChange={(resistance) => setTargets((c) => ({ ...c, resistance }))}
            />
            <RangeControl
              label="成形しやすさ"
              value={targets.processability}
              min={20}
              max={90}
              step={1}
              unit="/100"
              onChange={(processability) => setTargets((c) => ({ ...c, processability }))}
            />

            <div className="customPredictor">
              <label htmlFor="psmiles">
                <Search size={14} />
                開発中材料 PSMILES
              </label>
              <textarea id="psmiles" value={query} onChange={(event) => setQuery(event.target.value)} />
              <div className="customResult">
                <div>
                  <strong>{format(custom.predTgC, 0)}°C</strong>
                  <span>Tg予測</span>
                </div>
                <div>
                  <strong>{format(custom.props.modulus, 2)} GPa</strong>
                  <span>弾性率目安</span>
                </div>
              </div>
            </div>
          </aside>

          <section className="resultsPanel">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">
                  <Sparkles size={14} />
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
                  <Beaker size={14} />
                  candidate detail
                </p>
                <h2>選定根拠</h2>
              </div>
              <span className={`scoreBadge score-${selected.score >= 70 ? 'good' : selected.score >= 40 ? 'warn' : 'bad'}`}>
                score {selected.score}
              </span>
            </div>
            <div className="selectedMaterial">
              <strong>{selected.className}</strong>
              <code>{selected.psmiles}</code>
              <p>source {selected.source} · reliability {selected.reliability}</p>
            </div>
            <PropertyBar label="Tg" value={selected.predTgC} max={280} unit="°C" target={targets.tgC} />
            <PropertyBar label="弾性率" value={selected.props.modulus} max={7.2} unit=" GPa" target={targets.modulus} />
            <PropertyBar label="耐薬品性" value={selected.props.chemicalResistance} max={100} unit="/100" target={targets.resistance} />
            <PropertyBar label="成形しやすさ" value={selected.props.processability} max={100} unit="/100" target={targets.processability} />

            <div className="caeBox">
              <h3>CAE 連携目安</h3>
              <div className="caeGrid">
                <CaeMetric label="適合度 fit" value={projection.caeFit} maxVal={100} mode="fit" />
                <CaeMetric label="thermal margin" value={projection.thermalMargin} maxVal={80} mode="fit" />
                <CaeMetric label="warp risk" value={projection.warpRisk} maxVal={100} mode="risk" />
                <CaeMetric label="deflection risk" value={projection.deflectionRisk} maxVal={100} mode="risk" />
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
    </>
  )
}

function App() {
  if (window.location.pathname === '/guide') return <GuidePage />
  if (window.location.pathname === '/demo-v2' || window.location.pathname === '/demo_ver2') return <DemoV2 />
  return <MainDemo />
}

export default App
