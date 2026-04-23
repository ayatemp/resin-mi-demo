import modelData from '../data/polymerModel.json'

export type MaterialCandidate = (typeof modelData.candidates)[number]

export type Targets = {
  tgC: number
  modulus: number
  density: number
  resistance: number
  processability: number
  application: 'connector' | 'battery' | 'gear' | 'thinwall'
}

const featureNames = modelData.featureNames

function count(pattern: RegExp, text: string) {
  return text.match(pattern)?.length ?? 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function extractFeatures(psmiles: string) {
  const length = Math.max(psmiles.length, 1)
  const carbon = count(/C/g, psmiles) + count(/c/g, psmiles)
  const aromaticCarbon = count(/c/g, psmiles)
  const oxygen = count(/O/g, psmiles) + count(/o/g, psmiles)
  const nitrogen = count(/N/g, psmiles) + count(/n/g, psmiles)
  const sulfur = count(/S(?!i)/g, psmiles) + count(/s/g, psmiles)
  const silicon = count(/Si/g, psmiles)
  const fluorine = count(/F/g, psmiles)
  const chlorine = count(/Cl/g, psmiles)
  const bromine = count(/Br/g, psmiles)
  const stars = count(/\*/g, psmiles)
  const branches = count(/\(/g, psmiles)
  const rings = count(/[1-9]/g, psmiles)
  const doubleBonds = count(/=/g, psmiles)
  const tripleBonds = count(/#/g, psmiles)
  const hetero = oxygen + nitrogen + sulfur + silicon + fluorine + chlorine + bromine
  const estimatedMass =
    carbon * 12.01 +
    oxygen * 16 +
    nitrogen * 14.01 +
    sulfur * 32.06 +
    silicon * 28.09 +
    fluorine * 19 +
    chlorine * 35.45 +
    bromine * 79.9

  return [
    length,
    carbon,
    aromaticCarbon,
    oxygen,
    nitrogen,
    sulfur,
    silicon,
    fluorine,
    chlorine,
    bromine,
    stars,
    branches,
    rings,
    doubleBonds,
    tripleBonds,
    hetero / length,
    aromaticCarbon / length,
    estimatedMass,
  ]
}

function ridgePredict(features: number[]) {
  const ridge = modelData.ridge
  const scaled = features.map((value, index) => (value - ridge.means[index]) / ridge.scales[index])
  return ridge.weights[0] + scaled.reduce((sum, value, index) => sum + value * ridge.weights[index + 1], 0)
}

function distance(a: number[], b: number[]) {
  return Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0))
}

function knnPredict(features: number[]) {
  const ridge = modelData.ridge
  const scaled = features.map((value, index) => (value - ridge.means[index]) / ridge.scales[index])
  const nearest = modelData.neighborIndex
    .map((item) => ({ tgK: item.tgK, d: distance(item.scaled, scaled) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 9)
  const weighted = nearest.reduce(
    (acc, item) => {
      const weight = 1 / (item.d + 0.18)
      return { total: acc.total + item.tgK * weight, weight: acc.weight + weight }
    },
    { total: 0, weight: 0 },
  )
  return weighted.total / weighted.weight
}

export function predictTgK(psmiles: string) {
  const features = extractFeatures(psmiles)
  return ridgePredict(features) * 0.46 + knnPredict(features) * 0.54
}

export function deriveProperties(tgK: number, features: number[]) {
  const tgC = tgK - 273.15
  const [
    length,
    ,
    aromaticCarbon,
    oxygen,
    nitrogen,
    sulfur,
    silicon,
    fluorine,
    chlorine,
    bromine,
    ,
    branches,
    rings,
    ,
    tripleBonds,
    heteroRatio,
    aromaticRatio,
    estimatedMass,
  ] = features
  const heteroAtoms = oxygen + nitrogen + sulfur + silicon + fluorine + chlorine + bromine
  const halogens = fluorine + chlorine + bromine
  const density = clamp(0.89 + heteroRatio * 3.5 + aromaticRatio * 1.4 + halogens * 0.022, 0.86, 1.72)
  const modulus = clamp(
    0.55 + (tgC + 70) * 0.018 + aromaticCarbon * 0.035 + rings * 0.022 + tripleBonds * 0.08,
    0.25,
    7.2,
  )
  const hdt = clamp(tgC - 18 + aromaticCarbon * 0.7 + rings * 0.45, -90, 340)
  const chemicalResistance = clamp(42 + tgC * 0.13 + heteroAtoms * 0.8 + halogens * 3.6 + sulfur * 2.2, 8, 98)
  const processability = clamp(86 - tgC * 0.11 - aromaticCarbon * 0.55 + branches * 1.5 + silicon * 2.8, 12, 97)
  const flowIndex = clamp(processability * 0.72 + (length < 40 ? 14 : 0) - estimatedMass * 0.018, 8, 96)
  const caeStability = clamp(modulus * 10.5 + hdt * 0.16 + chemicalResistance * 0.32 - density * 9, 0, 100)
  return { tgC, density, modulus, hdt, chemicalResistance, processability, flowIndex, caeStability }
}

export function predictCustomMaterial(psmiles: string) {
  const features = extractFeatures(psmiles)
  const tgK = predictTgK(psmiles)
  return {
    psmiles,
    featureNames,
    features,
    predTgC: tgK - 273.15,
    props: deriveProperties(tgK, features),
  }
}

const appWeights = {
  connector: { tgC: 0.25, modulus: 0.2, density: 0.12, resistance: 0.3, processability: 0.13 },
  battery: { tgC: 0.34, modulus: 0.14, density: 0.1, resistance: 0.31, processability: 0.11 },
  gear: { tgC: 0.2, modulus: 0.36, density: 0.12, resistance: 0.18, processability: 0.14 },
  thinwall: { tgC: 0.16, modulus: 0.12, density: 0.22, resistance: 0.14, processability: 0.36 },
}

export function scoreCandidate(candidate: MaterialCandidate, targets: Targets) {
  const p = candidate.props
  const weights = appWeights[targets.application]
  const tgScore = clamp(1 - Math.abs(candidate.predTgC - targets.tgC) / 145, 0, 1)
  const modulusScore = clamp(p.modulus / targets.modulus, 0, 1.12)
  const densityScore = clamp(1 - Math.max(0, p.density - targets.density) / 0.55, 0, 1)
  const resistanceScore = clamp(p.chemicalResistance / targets.resistance, 0, 1.12)
  const processScore = clamp(p.processability / targets.processability, 0, 1.12)
  const score =
    tgScore * weights.tgC +
    modulusScore * weights.modulus +
    densityScore * weights.density +
    resistanceScore * weights.resistance +
    processScore * weights.processability
  return Math.round(clamp(score, 0, 1) * 100)
}

export function getRecommendations(targets: Targets) {
  return modelData.candidates
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, targets) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
}

export function caeProjection(candidate: MaterialCandidate, targets: Targets) {
  const thermalMargin = candidate.props.hdt - targets.tgC
  const stiffnessIndex = candidate.props.modulus / targets.modulus
  const massIndex = 1 / candidate.props.density
  const warpRisk = clamp(62 - candidate.props.processability * 0.38 + Math.max(0, targets.tgC - candidate.props.hdt) * 0.42, 4, 96)
  const deflectionRisk = clamp(74 - stiffnessIndex * 42 + candidate.props.density * 6, 3, 96)
  const caeFit = clamp(
    candidate.props.caeStability * 0.45 + stiffnessIndex * 22 + massIndex * 8 + Math.max(0, thermalMargin) * 0.08,
    0,
    100,
  )
  return {
    caeFit,
    thermalMargin,
    stiffnessIndex,
    warpRisk,
    deflectionRisk,
  }
}

export { modelData }
