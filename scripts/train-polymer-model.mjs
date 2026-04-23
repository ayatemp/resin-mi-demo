import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'csv-parse/sync'

const DATA_URL =
  'https://zenodo.org/records/15210035/files/LAMALAB_CURATED_Tg_structured_polymerclass.csv?download=1'
const CACHE_PATH = path.resolve('.cache/polymer-tg.csv')
const OUT_PATH = path.resolve('src/data/polymerModel.json')

const featureNames = [
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
]

function count(pattern, text) {
  return text.match(pattern)?.length ?? 0
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function extractFeatures(psmiles) {
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
  return { intercept: 0, weights: solveLinearSystem(xtx, xty), means, scales }
}

function predictRidge(model, features) {
  const scaled = features.map((value, index) => (value - model.means[index]) / model.scales[index])
  return model.weights[0] + scaled.reduce((sum, value, index) => sum + value * model.weights[index + 1], 0)
}

function distance(a, b) {
  return Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0))
}

function predictKnn(scaledTrainRows, targets, scaledFeatures, k = 9) {
  return scaledTrainRows
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
}

function derivedProperties(tgK, features) {
  const tgC = tgK - 273.15
  const [
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
  return { tgC, density, modulus, hdt, chemicalResistance, processability, flowIndex, caeStability, carbon }
}

function stratifiedSample(items, limitPerClass = 86) {
  const grouped = items.reduce((acc, item) => {
    acc[item.className] ??= []
    acc[item.className].push(item)
    return acc
  }, {})
  return Object.values(grouped).flatMap((group) => seededShuffle(group, group.length + limitPerClass).slice(0, limitPerClass))
}

async function ensureDataset() {
  await mkdir(path.dirname(CACHE_PATH), { recursive: true })
  if (existsSync(CACHE_PATH)) return readFile(CACHE_PATH, 'utf8')
  const response = await fetch(DATA_URL)
  if (!response.ok) throw new Error(`Dataset download failed: ${response.status}`)
  const text = await response.text()
  await writeFile(CACHE_PATH, text)
  return text
}

const csv = await ensureDataset()
const records = parse(csv, { columns: true, skip_empty_lines: true })
const dataset = records
  .map((record, index) => {
    const tgK = Number(record['labels.Exp_Tg(K)'])
    const psmiles = record.PSMILES
    if (!Number.isFinite(tgK) || !psmiles) return null
    const features = extractFeatures(psmiles)
    return {
      id: index + 1,
      psmiles,
      polymer: record['meta.polymer'] || `Candidate ${index + 1}`,
      className: record['meta.polymer_class'] || record.raw_polymer_class || 'Other class',
      source: record['meta.source'] || 'PolyMetriX',
      reliability: record['meta.reliability'] || 'black',
      tgK,
      features,
    }
  })
  .filter(Boolean)

const shuffled = seededShuffle(dataset)
const testSize = Math.floor(shuffled.length * 0.18)
const test = shuffled.slice(0, testSize)
const train = shuffled.slice(testSize)
const ridge = trainRidge(
  train.map((item) => item.features),
  train.map((item) => item.tgK),
)
const scaledTrain = standardizeMatrix(
  train.map((item) => item.features),
  ridge.means,
  ridge.scales,
).rows

function predictBlend(features) {
  const ridgePrediction = predictRidge(ridge, features)
  const scaled = features.map((value, index) => (value - ridge.means[index]) / ridge.scales[index])
  const knn = predictKnn(
    scaledTrain,
    train.map((item) => item.tgK),
    scaled,
  )
  return ridgePrediction * 0.46 + (knn.total / knn.weight) * 0.54
}

const testPredictions = test.map((item) => predictBlend(item.features))
const testTargets = test.map((item) => item.tgK)
const mae = mean(testPredictions.map((pred, index) => Math.abs(pred - testTargets[index])))
const rmse = Math.sqrt(mean(testPredictions.map((pred, index) => (pred - testTargets[index]) ** 2)))
const yMean = mean(testTargets)
const ssRes = testPredictions.reduce((sum, pred, index) => sum + (testTargets[index] - pred) ** 2, 0)
const ssTot = testTargets.reduce((sum, value) => sum + (value - yMean) ** 2, 0)
const r2 = 1 - ssRes / ssTot

const classCounts = dataset.reduce((acc, item) => {
  acc[item.className] = (acc[item.className] ?? 0) + 1
  return acc
}, {})

const candidateBase = stratifiedSample(dataset)
const candidates = candidateBase.map((item) => {
  const predTgK = predictBlend(item.features)
  return {
    id: item.id,
    psmiles: item.psmiles,
    polymer: item.polymer,
    className: item.className,
    source: item.source,
    reliability: item.reliability,
    expTgC: Number((item.tgK - 273.15).toFixed(1)),
    predTgC: Number((predTgK - 273.15).toFixed(1)),
    props: Object.fromEntries(
      Object.entries(derivedProperties(predTgK, item.features)).map(([key, value]) => [key, Number(value.toFixed(2))]),
    ),
  }
})

const tgValues = candidates.map((item) => item.predTgC)
const minTg = Math.floor(Math.min(...tgValues) / 20) * 20
const maxTg = Math.ceil(Math.max(...tgValues) / 20) * 20
const histogram = Array.from({ length: 18 }, (_, index) => {
  const from = minTg + ((maxTg - minTg) / 18) * index
  const to = minTg + ((maxTg - minTg) / 18) * (index + 1)
  return {
    from: Number(from.toFixed(1)),
    to: Number(to.toFixed(1)),
    count: candidates.filter((item) => item.predTgC >= from && item.predTgC < to).length,
  }
})

const model = {
  generatedAt: new Date().toISOString(),
  source: {
    name: 'PolyMetriX curated glass-transition dataset',
    url: DATA_URL,
    license: 'CC BY 4.0 per PolyMetriX/Zenodo metadata',
  },
  featureNames,
  ridge,
  trainingRows: train.length,
  testRows: test.length,
  metrics: {
    maeK: Number(mae.toFixed(2)),
    rmseK: Number(rmse.toFixed(2)),
    r2: Number(r2.toFixed(3)),
  },
  classCounts,
  histogram,
  evalPoints: test.slice(0, 120).map((item, index) => ({
    actual: Number((item.tgK - 273.15).toFixed(1)),
    predicted: Number((testPredictions[index] - 273.15).toFixed(1)),
  })),
  neighborIndex: seededShuffle(
    train.map((item, index) => ({ item, scaled: scaledTrain[index] })),
    314,
  )
    .slice(0, 2600)
    .map(({ item, scaled }) => ({
    id: item.id,
    tgK: Number(item.tgK.toFixed(3)),
    scaled: scaled.map((value) => Number(value.toFixed(4))),
  })),
  candidates,
}

await mkdir(path.dirname(OUT_PATH), { recursive: true })
await writeFile(OUT_PATH, `${JSON.stringify(model)}\n`)

console.log(`trained on ${train.length} rows, tested on ${test.length} rows`)
console.log(`MAE ${model.metrics.maeK} K / RMSE ${model.metrics.rmseK} K / R2 ${model.metrics.r2}`)
console.log(`wrote ${OUT_PATH}`)
