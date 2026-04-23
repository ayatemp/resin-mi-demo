import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'csv-parse/sync'

const TG_URL =
  'https://zenodo.org/records/15210035/files/LAMALAB_CURATED_Tg_structured_polymerclass.csv?download=1'
const PG_URL = 'https://ndownloader.figshare.com/files/26809907'
const TG_CACHE_PATH = path.resolve('.cache/polymer-tg.csv')
const PG_ZIP_PATH = path.resolve('.cache/pgnome.json.zip')
const PG_JSON_PATH = path.resolve('.cache/pgnome.json')
const OUT_PATH = path.resolve('src/data/polymerModelV2.json')

const compositionFeatureNames = [
  'heavyAtomCount',
  'carbonFraction',
  'oxygenFraction',
  'nitrogenFraction',
  'sulfurFraction',
  'siliconFraction',
  'fluorineFraction',
  'chlorineFraction',
  'bromineFraction',
  'heteroFraction',
  'halogenFraction',
  'estimatedMass',
  'massPerHeavyAtom',
  'ringMarks',
  'doubleBonds',
  'tripleBonds',
  'branches',
  'aromaticFraction',
]

const masses = {
  H: 1.008,
  C: 12.011,
  N: 14.007,
  O: 15.999,
  F: 18.998,
  S: 32.06,
  Si: 28.085,
  Cl: 35.45,
  Br: 79.904,
}

function count(pattern, text) {
  return text.match(pattern)?.length ?? 0
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function safeNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function compositionFeaturesFromCounts(counts, extras = {}) {
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

function compositionFeaturesFromPsmiles(psmiles) {
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

function compositionFeaturesFromElements(elements) {
  const counts = elements.reduce((acc, element) => {
    if (element === 'H') return acc
    acc[element] = (acc[element] ?? 0) + 1
    return acc
  }, {})
  return compositionFeaturesFromCounts(counts)
}

function psmilesFeatures(psmiles) {
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

function seededShuffle(items, seed = 42) {
  let state = seed
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardizeMatrix(rows, providedMeans, providedScales) {
  const columns = rows[0].length
  const means =
    providedMeans ??
    Array.from({ length: columns }, (_, column) => mean(rows.map((row) => row[column])))
  const scales =
    providedScales ??
    Array.from({ length: columns }, (_, column) => {
      const variance = mean(rows.map((row) => (row[column] - means[column]) ** 2))
      return Math.sqrt(variance) || 1
    })

  return {
    means,
    scales,
    rows: rows.map((row) => row.map((value, index) => (value - means[index]) / scales[index])),
  }
}

function solveLinearSystem(matrix, vector) {
  const n = vector.length
  const a = matrix.map((row, index) => [...row, vector[index]])
  for (let column = 0; column < n; column += 1) {
    let pivot = column
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row
    }
    ;[a[column], a[pivot]] = [a[pivot], a[column]]
    const divisor = a[column][column] || 1e-12
    for (let col = column; col <= n; col += 1) a[column][col] /= divisor
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue
      const factor = a[row][column]
      for (let col = column; col <= n; col += 1) a[row][col] -= factor * a[column][col]
    }
  }
  return a.map((row) => row[n])
}

function trainRidge(features, targets, lambda = 1.8) {
  const { rows, means, scales } = standardizeMatrix(features)
  const columns = rows[0].length + 1
  const xtx = Array.from({ length: columns }, () => Array(columns).fill(0))
  const xty = Array(columns).fill(0)

  rows.forEach((row, rowIndex) => {
    const x = [1, ...row]
    for (let i = 0; i < columns; i += 1) {
      xty[i] += x[i] * targets[rowIndex]
      for (let j = 0; j < columns; j += 1) xtx[i][j] += x[i] * x[j]
    }
  })
  for (let i = 1; i < columns; i += 1) xtx[i][i] += lambda
  return { weights: solveLinearSystem(xtx, xty), means, scales }
}

function predictRidge(model, features) {
  const scaled = features.map((value, index) => (value - model.means[index]) / model.scales[index])
  return model.weights[0] + scaled.reduce((sum, value, index) => sum + value * model.weights[index + 1], 0)
}

function distance(a, b) {
  return Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0))
}

function predictKnn(scaledTrainRows, targets, scaledFeatures, k = 9) {
  const weighted = scaledTrainRows
    .map((row, index) => ({ index, d: distance(row, scaledFeatures) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .reduce(
      (acc, item) => {
        const weight = 1 / (item.d + 0.18)
        return { total: acc.total + targets[item.index] * weight, weight: acc.weight + weight }
      },
      { total: 0, weight: 0 },
    )
  return weighted.total / weighted.weight
}

function regressionMetrics(actual, predicted) {
  const mae = mean(predicted.map((pred, index) => Math.abs(pred - actual[index])))
  const rmse = Math.sqrt(mean(predicted.map((pred, index) => (pred - actual[index]) ** 2)))
  const yMean = mean(actual)
  const ssRes = predicted.reduce((sum, pred, index) => sum + (actual[index] - pred) ** 2, 0)
  const ssTot = actual.reduce((sum, value) => sum + (value - yMean) ** 2, 0)
  return {
    mae: Number(mae.toFixed(3)),
    rmse: Number(rmse.toFixed(3)),
    r2: Number((1 - ssRes / ssTot).toFixed(3)),
  }
}

function stratifiedSample(items, limitPerClass = 62) {
  const grouped = items.reduce((acc, item) => {
    acc[item.className] ??= []
    acc[item.className].push(item)
    return acc
  }, {})
  return Object.values(grouped).flatMap((group) => seededShuffle(group, group.length + limitPerClass).slice(0, limitPerClass))
}

async function ensureText(url, filePath) {
  await mkdir(path.dirname(filePath), { recursive: true })
  if (existsSync(filePath)) return readFile(filePath, 'utf8')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed: ${url} ${response.status}`)
  const text = await response.text()
  await writeFile(filePath, text)
  return text
}

async function ensurePolymerGenome() {
  await mkdir(path.dirname(PG_ZIP_PATH), { recursive: true })
  if (!existsSync(PG_ZIP_PATH)) {
    const response = await fetch(PG_URL)
    if (!response.ok) throw new Error(`Polymer Genome download failed: ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    await writeFile(PG_ZIP_PATH, buffer)
  }
  if (!existsSync(PG_JSON_PATH)) {
    const jsonText = execFileSync('unzip', ['-p', PG_ZIP_PATH, 'pgnome.json'], {
      encoding: 'utf8',
      maxBuffer: 20_000_000,
    })
    await writeFile(PG_JSON_PATH, jsonText)
  }
  return JSON.parse(await readFile(PG_JSON_PATH, 'utf8'))
}

function trainTarget(rows, targetKey, seed, lambda = 2.2) {
  const usable = seededShuffle(
    rows.filter((row) => Number.isFinite(row[targetKey])),
    seed,
  )
  const testSize = Math.max(20, Math.floor(usable.length * 0.18))
  const test = usable.slice(0, testSize)
  const train = usable.slice(testSize)
  const ridge = trainRidge(
    train.map((item) => item.features),
    train.map((item) => item[targetKey]),
    lambda,
  )
  const scaledTrain = standardizeMatrix(
    train.map((item) => item.features),
    ridge.means,
    ridge.scales,
  ).rows

  function predict(features) {
    const ridgePrediction = predictRidge(ridge, features)
    const scaled = features.map((value, index) => (value - ridge.means[index]) / ridge.scales[index])
    const knnPrediction = predictKnn(
      scaledTrain,
      train.map((item) => item[targetKey]),
      scaled,
      7,
    )
    return ridgePrediction * 0.62 + knnPrediction * 0.38
  }

  const predicted = test.map((item) => predict(item.features))
  const actual = test.map((item) => item[targetKey])
  return {
    model: ridge,
    trainingRows: train.length,
    testRows: test.length,
    metrics: regressionMetrics(actual, predicted),
    evalPoints: test.slice(0, 80).map((item, index) => ({
      actual: Number(actual[index].toFixed(3)),
      predicted: Number(predicted[index].toFixed(3)),
    })),
    predict,
  }
}

const tgCsv = await ensureText(TG_URL, TG_CACHE_PATH)
const tgRecords = parse(tgCsv, { columns: true, skip_empty_lines: true })
const tgRows = tgRecords
  .map((record, index) => {
    const tgK = safeNumber(record['labels.Exp_Tg(K)'])
    const psmiles = record.PSMILES
    if (tgK == null || !psmiles) return null
    return {
      id: index + 1,
      psmiles,
      polymer: record['meta.polymer'] || `Candidate ${index + 1}`,
      className: record['meta.polymer_class'] || record.raw_polymer_class || 'Other class',
      source: record['meta.source'] || 'PolyMetriX',
      reliability: record['meta.reliability'] || 'black',
      tgK,
      features: psmilesFeatures(psmiles),
    }
  })
  .filter(Boolean)

const tgTarget = trainTarget(tgRows, 'tgK', 101, 1.8)

const pgnome = await ensurePolymerGenome()
const allowedElements = new Set(Object.keys(masses))
const pgRows = pgnome
  .filter((row) => row.atoms?.elements?.includes('C') && row.atoms.elements.every((element) => allowedElements.has(element)))
  .map((row) => {
    const elements = row.atoms.elements
    const mass = elements.reduce((sum, element) => sum + masses[element], 0)
    const density = (mass / Number(row.vol)) * 1.66054
    return {
      id: row.id,
      label: row.label,
      features: compositionFeaturesFromElements(elements),
      density,
      dielectric: Number(row.diel_tot),
      bandGap: Number(row.hse_gap),
      atomization: Number(row.atom_en),
    }
  })
  .filter((row) =>
    Number.isFinite(row.density) &&
    Number.isFinite(row.dielectric) &&
    Number.isFinite(row.bandGap) &&
    Number.isFinite(row.atomization),
  )

const densityTarget = trainTarget(pgRows, 'density', 202, 2.5)
const dielectricTarget = trainTarget(pgRows, 'dielectric', 303, 2.8)
const bandGapTarget = trainTarget(pgRows, 'bandGap', 404, 2.4)
const atomizationTarget = trainTarget(pgRows, 'atomization', 505, 2.2)

function predictMulti(psmiles) {
  const tgFeatures = psmilesFeatures(psmiles)
  const compositionFeatures = compositionFeaturesFromPsmiles(psmiles)
  const tgK = tgTarget.predict(tgFeatures)
  const density = clamp(densityTarget.predict(compositionFeatures), 0.7, 2.4)
  const dielectric = clamp(dielectricTarget.predict(compositionFeatures), 1.4, 16)
  const bandGap = clamp(bandGapTarget.predict(compositionFeatures), 0.2, 9.8)
  const atomization = clamp(atomizationTarget.predict(compositionFeatures), -7.2, -4.2)
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

const classCounts = tgRows.reduce((acc, item) => {
  acc[item.className] = (acc[item.className] ?? 0) + 1
  return acc
}, {})

const candidateBase = stratifiedSample(tgRows)
const candidates = candidateBase.map((item) => {
  const pred = predictMulti(item.psmiles)
  return {
    id: item.id,
    psmiles: item.psmiles,
    polymer: item.polymer,
    className: item.className,
    source: item.source,
    reliability: item.reliability,
    expTgC: Number((item.tgK - 273.15).toFixed(1)),
    pred: Object.fromEntries(Object.entries(pred).map(([key, value]) => [key, Number(value.toFixed(3))])),
  }
})

const tgValues = candidates.map((item) => item.pred.tgC)
const minTg = Math.floor(Math.min(...tgValues) / 20) * 20
const maxTg = Math.ceil(Math.max(...tgValues) / 20) * 20
const histogram = Array.from({ length: 18 }, (_, index) => {
  const from = minTg + ((maxTg - minTg) / 18) * index
  const to = minTg + ((maxTg - minTg) / 18) * (index + 1)
  return {
    from: Number(from.toFixed(1)),
    to: Number(to.toFixed(1)),
    count: candidates.filter((item) => item.pred.tgC >= from && item.pred.tgC < to).length,
  }
})

const model = {
  generatedAt: new Date().toISOString(),
  version: 'demo-v2',
  sources: [
    {
      name: 'PolyMetriX curated glass-transition dataset',
      url: TG_URL,
      labels: ['Tg'],
    },
    {
      name: 'Polymer Genome / Figshare pgnome.json',
      url: PG_URL,
      labels: ['density (computed from mass/volume)', 'dielectric constant', 'HSE band gap', 'atomization energy'],
      note: 'Organic subset filtered to C/H/N/O/F/S/Cl/Br/Si-containing polymers.',
    },
  ],
  featureNames: {
    tg: [
      'length',
      'carbon',
      'aromaticCarbon',
      'oxygen',
      'nitrogen',
      'sulfur',
      'silicon',
      'fluorine',
      'chlorine',
      'bromine',
      'stars',
      'branches',
      'rings',
      'doubleBonds',
      'tripleBonds',
      'heteroRatio',
      'aromaticRatio',
      'estimatedMass',
    ],
    composition: compositionFeatureNames,
  },
  models: {
    tgK: {
      label: 'Glass transition temperature',
      unit: 'K',
      ...tgTarget.model,
      trainingRows: tgTarget.trainingRows,
      testRows: tgTarget.testRows,
      metrics: tgTarget.metrics,
    },
    density: {
      label: 'Density',
      unit: 'g/cm3',
      ...densityTarget.model,
      trainingRows: densityTarget.trainingRows,
      testRows: densityTarget.testRows,
      metrics: densityTarget.metrics,
    },
    dielectric: {
      label: 'Dielectric constant',
      unit: '',
      ...dielectricTarget.model,
      trainingRows: dielectricTarget.trainingRows,
      testRows: dielectricTarget.testRows,
      metrics: dielectricTarget.metrics,
    },
    bandGap: {
      label: 'HSE band gap',
      unit: 'eV',
      ...bandGapTarget.model,
      trainingRows: bandGapTarget.trainingRows,
      testRows: bandGapTarget.testRows,
      metrics: bandGapTarget.metrics,
    },
    atomization: {
      label: 'Atomization energy',
      unit: 'eV/atom',
      ...atomizationTarget.model,
      trainingRows: atomizationTarget.trainingRows,
      testRows: atomizationTarget.testRows,
      metrics: atomizationTarget.metrics,
    },
  },
  trainingSummary: {
    tgRows: tgRows.length,
    polymerGenomeRows: pgRows.length,
  },
  classCounts,
  histogram,
  evalPoints: {
    tgC: tgTarget.evalPoints.map((point) => ({
      actual: Number((point.actual - 273.15).toFixed(2)),
      predicted: Number((point.predicted - 273.15).toFixed(2)),
    })),
    density: densityTarget.evalPoints,
    dielectric: dielectricTarget.evalPoints,
    bandGap: bandGapTarget.evalPoints,
    atomization: atomizationTarget.evalPoints,
  },
  candidates,
}

await mkdir(path.dirname(OUT_PATH), { recursive: true })
await writeFile(OUT_PATH, `${JSON.stringify(model)}\n`)

console.log('demo-v2 trained')
console.log(`Tg rows: ${tgTarget.trainingRows}/${tgTarget.testRows}`, tgTarget.metrics)
console.log(`Density rows: ${densityTarget.trainingRows}/${densityTarget.testRows}`, densityTarget.metrics)
console.log(`Dielectric rows: ${dielectricTarget.trainingRows}/${dielectricTarget.testRows}`, dielectricTarget.metrics)
console.log(`Band gap rows: ${bandGapTarget.trainingRows}/${bandGapTarget.testRows}`, bandGapTarget.metrics)
console.log(`Atomization rows: ${atomizationTarget.trainingRows}/${atomizationTarget.testRows}`, atomizationTarget.metrics)
console.log(`wrote ${OUT_PATH}`)
