# Resin MI Demo

公開ポリマーデータから軽量な Materials Informatics モデルを学習し、要求特性から候補樹脂を探索するWebデモです。

## Live Demo

- Main demo: https://resin-mi-demo.vercel.app/
- Guide: https://resin-mi-demo.vercel.app/guide
- Learned multi-property demo: https://resin-mi-demo.vercel.app/demo-v2
- Alias: https://resin-mi-demo.vercel.app/demo_ver2

## What Is Learned

### demo v1

- 学習値: Tg（ガラス転移温度）
- データ: PolyMetriX curated glass transition temperature dataset
- モデル: PSMILES token features + ridge regression + nearest-neighbor blending
- 注意: 弾性率、密度、耐薬品性、成形性、CAE指標はデモ用の推定値です。

### demo v2

- 学習値: Tg、密度、誘電率、HSE band gap、原子化エネルギー
- Tgデータ: PolyMetriX curated glass transition temperature dataset
- 複数物性データ: Polymer Genome JSON data
- モデル: PSMILES / 組成特徴量 + ridge regression
- 注意: CAE readiness、thermal risk、electrical risk、mass penaltyは、学習済み物性から計算する二次スクリーニングです。CAE解析そのものの学習モデルではありません。

Current V2 held-out metrics are stored in `src/data/polymerModelV2.json`.

## Commands

```bash
npm install
npm run train
npm run train:v2
npm run build
npm run dev
```

`npm run train:v2` downloads public source data into `.cache/`, trains the demo models, and regenerates `src/data/polymerModelV2.json`.

## Notes

This is a portfolio/demo implementation for resin material selection workflows. Real material development should validate predictions against in-house measurements, supplier datasheets, and CAE results before decision-making.
