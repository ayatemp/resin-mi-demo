import modelV2 from '../data/polymerModelV2.json'

type V2Model = (typeof modelV2.models)[keyof typeof modelV2.models]
export type V2Candidate = (typeof modelV2.candidates)[number]

export type TargetsV2 = {
  tgC: number
  densityMax: number
  dielectricMin: number
  bandGapMin: number
  stabilityMin: number
}

const masses = {
  C: 12.011,
  N: 14.007,
  O: 15.999,
  F: 18.998,
  S: 32.06,
  Si: 28.085,
  Cl: 35.45,
  Br: 79.904,
}

function count(pattern: RegExp, text: string) {
  return text.match(pattern)?.length ?? 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function compositionFeaturesFromCounts(counts: Record<string, number>, extras: Record<string, number> = {}) {
  const carbon = counts.C ?? 0
  const oxygen = counts.O ?? 0
  const nitrogen = counts.N ?? 0
  const sulfur = counts.S ?? 0
  const silicon = counts.Si ?? 0
  const fluorine = counts.F ?? 0
  const chlorine = counts.Cl ?? 0
  const bromine = counts.Br ?? 0
  const aromaticCarbon = extras.aromaticCarbon ?? 0
  const heavyAtomCount = Math.max(1, carbon + oxygen + nitrogen + sulfur + silicon + fluorine + chlorine + bromine)
  const hetero = oxygen + nitrogen + sulfur + silicon + fluorine + chlorine + bromine
  const halogen = fluorine + chlorine + bromine
  const estimatedMass =
    carbon * masses.C +
    oxygen * masses.O +
    nitrogen * masses.N +
    sulfur * masses.S +
    silicon * masses.Si +
    fluorine * masses.F +
    chlorine * masses.Cl +
    bromine * masses.Br

  return [
    heavyAtomCount,
    carbon / heavyAtomCount,
    oxygen / heavyAtomCount,
    nitrogen / heavyAtomCount,
    sulfur / heavyAtomCount,
    silicon / heavyAtomCount,
    fluorine / heavyAtomCount,
    chlorine / heavyAtomCount,
    bromine / heavyAtomCount,
    hetero / heavyAtomCount,
    halogen / heavyAtomCount,
    estimatedMass,
    estimatedMass / heavyAtomCount,
    extras.ringMarks ?? 0,
    extras.doubleBonds ?? 0,
    extras.tripleBonds ?? 0,
    extras.branches ?? 0,
    aromaticCarbon / heavyAtomCount,
  ]
}

function psmilesFeatures(psmiles: string) {
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
    carbon * masses.C +
    oxygen * masses.O +
    nitrogen * masses.N +
    sulfur * masses.S +
    silicon * masses.Si +
    fluorine * masses.F +
    chlorine * masses.Cl +
    bromine * masses.Br

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

export function compositionFeaturesFromPsmiles(psmiles: string) {
  const counts = {
    C: count(/C/g, psmiles) + count(/c/g, psmiles),
    O: count(/O/g, psmiles) + count(/o/g, psmiles),
    N: count(/N/g, psmiles) + count(/n/g, psmiles),
    S: count(/S(?!i)/g, psmiles) + count(/s/g, psmiles),
    Si: count(/Si/g, psmiles),
    F: count(/F/g, psmiles),
    Cl: count(/Cl/g, psmiles),
    Br: count(/Br/g, psmiles),
  }
  return compositionFeaturesFromCounts(counts, {
    aromaticCarbon: count(/c/g, psmiles),
    ringMarks: count(/[1-9]/g, psmiles),
    doubleBonds: count(/=/g, psmiles),
    tripleBonds: count(/#/g, psmiles),
    branches: count(/\(/g, psmiles),
  })
}

function predictRidge(model: V2Model, features: number[]) {
  const scaled = features.map((value, index) => (value - model.means[index]) / model.scales[index])
  return model.weights[0] + scaled.reduce((sum, value, index) => sum + value * model.weights[index + 1], 0)
}

export function predictV2Material(psmiles: string) {
  const tgK = predictRidge(modelV2.models.tgK, psmilesFeatures(psmiles))
  const composition = compositionFeaturesFromPsmiles(psmiles)
  const density = clamp(predictRidge(modelV2.models.density, composition), 0.7, 2.4)
  const dielectric = clamp(predictRidge(modelV2.models.dielectric, composition), 1.4, 16)
  const bandGap = clamp(predictRidge(modelV2.models.bandGap, composition), 0.2, 9.8)
  const atomization = clamp(predictRidge(modelV2.models.atomization, composition), -7.2, -4.2)
  const stabilityIndex = clamp((Math.abs(atomization) - 4.6) * 42, 0, 100)
  const insulationIndex = clamp(bandGap * 10 + dielectric * 1.5, 0, 100)
  const thermalScreening = clamp((tgK - 273.15) * 0.28 + stabilityIndex * 0.32 + bandGap * 3, 0, 100)
  return {
    tgC: tgK - 273.15,
    density,
    dielectric,
    bandGap,
    atomization,
    stabilityIndex,
    insulationIndex,
    thermalScreening,
  }
}

const weights = {
  tg: 0.3,
  density: 0.18,
  dielectric: 0.18,
  bandGap: 0.18,
  stability: 0.16,
}

export function scoreV2Candidate(candidate: V2Candidate, targets: TargetsV2) {
  const p = candidate.pred
  const tgScore = clamp(1 - Math.abs(p.tgC - targets.tgC) / 160, 0, 1)
  const densityScore = clamp(1 - Math.max(0, p.density - targets.densityMax) / 0.65, 0, 1)
  const dielectricScore = clamp(p.dielectric / targets.dielectricMin, 0, 1)
  const bandGapScore = clamp(p.bandGap / targets.bandGapMin, 0, 1)
  const stabilityScore = clamp(p.stabilityIndex / targets.stabilityMin, 0, 1)
  return Math.round(
    clamp(
      tgScore * weights.tg +
        densityScore * weights.density +
        dielectricScore * weights.dielectric +
        bandGapScore * weights.bandGap +
        stabilityScore * weights.stability,
      0,
      1,
    ) * 100,
  )
}

export function getV2Recommendations(targets: TargetsV2) {
  return modelV2.candidates
    .map((candidate) => ({ ...candidate, score: scoreV2Candidate(candidate, targets) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
}

export function v2ScreeningProjection(candidate: V2Candidate) {
  return {
    caeReadiness: clamp(
      candidate.pred.thermalScreening * 0.38 +
        candidate.pred.stabilityIndex * 0.26 +
        candidate.pred.insulationIndex * 0.22 +
        (2.1 - candidate.pred.density) * 7,
      0,
      100,
    ),
    thermalRisk: clamp(78 - candidate.pred.thermalScreening * 0.72, 0, 100),
    electricalRisk: clamp(82 - candidate.pred.insulationIndex * 0.72, 0, 100),
    massPenalty: clamp((candidate.pred.density - 1.05) * 70, 0, 100),
  }
}

export { modelV2 }
