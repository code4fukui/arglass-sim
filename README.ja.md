# グリーン単色 WebXR AR HUD

[English README](./README.md)

レトロなグリーン単色ARグラス風の、単一HTMLファイル構成の WebXR AR HUD シミュレータです。

現在の実装では、HUDを固定 `640x480` のCanvasに描画し、そのCanvasを視点前方 `1.5m` に置いた板へ貼り付けています。これにより、意図的に低解像度の見え方を維持しつつ、以前の3Dラインオブジェクト方式より軽量に動作します。

## ファイル

- `index.html`: アプリ全体を含む単一の ES module HTML

## 現在の挙動

- 対応環境では WebXR `immersive-ar` を使用
- AR対応ブラウザでは実世界カメラのパススルー表示を使用
- 非対応環境では暗い背景のフルスクリーンシミュレータにフォールバック
- HUDはグリーン単色の `640x480` Canvas テクスチャとして描画
- HUDの横FOVは `30°`
- HUDは視点の `1.5m` 前方に固定
- 描画要素:
  - 中央クロスヘア
  - スクロールするヘディングテープ
  - 人工水平線
  - 下段の情報列
    - 時刻
    - ヘディング
    - ピッチ
    - ロール
    - バッテリー
- 明るさ、コントラスト、グロー、HUDスケール、スキャンラインを調整可能

## ローカル実行

ファイルを直接開かず、`localhost` か HTTPS で配信してください。

```bash
cd /Users/fukuno/data/js/webvr/arglass-sim
python3 -m http.server 8000
```

その後、以下を開きます。

```text
http://localhost:8000
```

## WebXR に関する注意

- `immersive-ar` には WebXR AR 対応ブラウザと対応デバイスが必要です。
- カメラのパススルー表示は実際の AR セッション中のみ利用できます。
- 多くのデスクトップブラウザではフォールバックシミュレータのみ動作します。
- ヘディング表示は真北ではなく、起動時の向きを `0` とした相対方位です。

## 操作

ランチャーUIは現在HTML上で初期非表示ですが、ページ内には以下の調整項目が残っています。

- `Brightness`
- `Contrast`
- `Glow`
- `HUD Scale`
- `Scanlines`

フォールバックシミュレータの操作:

- マウスまたはタッチでドラッグして視点を回転

## 調整ポイント

単色HUDの見た目は主に以下で制御しています。

- モジュール先頭付近の `appearance`
- `computeGreenPalette()`
- `applyMonochromeAppearance()`
- `drawHudBox()` と `drawHudLine()`
- 実際の `640x480` HUD を描く `updateHud()`

効果を強めるには:

- `brightness` を上げる
- `contrast` を上げる
- `glow` を上げる
- `lineThickness` を上げる
- `scanlines` を有効にする

効果を弱めるには:

- `glow` を下げる
- `contrast` を下げる
- `scanlines` を無効にする
- `applyMonochromeAppearance()` 内の CSS `drop-shadow()` と `contrast()` を弱める

## 構成

`index.html` は主に以下の単位で構成されています。

- XR / セッション初期化
- HUD Canvas の生成
- グリーン単色表示の制御
- フォールバックシミュレータ
- 毎フレームのHUD描画
