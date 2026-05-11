# グリーンモノクロ WebXR AR HUD

レトロなグリーンモノクロ WebXR AR HUD シミュレータ。

シミュレータのコアは ES モジュールクラス `ARGlassSim` として公開されており、別のリポジトリがこれをインポートして独自の DOM にマウントできます。

現在の実装では、HUD を固定された `640x480` キャンバスにレンダリングし、それを視聴者から `1.5m` 離れた位置に配置された平面にマッピングしています。これにより、以前の3Dラインオブジェクトアプローチよりも意図的に低解像度にし、レンダリング負荷を軽くしています。

## ファイル

- `ARGlassSim.js`: 別のアプリケーションにシミュレータをマウントするための再利用可能な ES モジュールクラス
- `index.html`: モジュールと同梱のランチャーUIを連携させるデモページ
- `sample.html`: `ARGlassSim` をベースにアプリを構築する例
- `style.css`: デモページから抽出されたスタイルシート
- `package.json`: リポジトリを ESM としてマークし、`ARGlassSim.js` をエクスポート

## モジュールとしてインポート

```js
import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { ARGlassSim } from '../arglass-sim/ARGlassSim.js';

const sim = new ARGlassSim({
  THREE,
  ARButton,
  mount: document.getElementById('app'),
  launcher: document.getElementById('launcher'),
  touchHint: document.getElementById('touchHint'),
  xrButtonHost: document.getElementById('xrButtonHost'),
  scanlinesEl: document.getElementById('scanlines'),
  controls: {
    brightness: document.getElementById('brightness'),
    contrast: document.getElementById('contrast'),
    glow: document.getElementById('glow'),
    lineThickness: document.getElementById('lineThickness'),
    scanlines: document.getElementById('scanlineToggle'),
    startSimButton: document.getElementById('startSimButton'),
  },
});

sim.start();
sim.setAppearance({ glow: 0.6, contrast: 1.3 });
```

必須オプション:

- `mount`
- `THREE`

オプションのUIフック:

- `ARButton`
- `launcher`
- `touchHint`
- `xrButtonHost`
- `scanlinesEl`
- `controls`

`sample.html` は派生アプリケーションで想定される開発スタイルを示しています。`ARGlassSim` をレンダリングとXRの基盤として維持し、独自のUI、シーンの動作、またはアプリケーション固有のロジックをその周りに追加します。

## 現在の動作

- サポートされている場合、WebXR の `immersive-ar` を使用
- AR対応ブラウザでは現実世界のカメラパススルーを表示
- ドラッグ操作で見回せるダークなフルスクリーンシミュレータにフォールバック
- HUDをグリーンのみの `640x480` キャンバステクスチャとしてレンダリング
- HUDの水平視野角を `30°` に設定
- HUDを視聴者から `1.5m` 離れた位置に固定
- 描画内容:
  - 中心のクロスヘア
  - スクロールするヘディング（方位）テープ
  - 人工地平線
  - 時刻、方位、ピッチ、ロールを表示する下部のステータス行
- 明るさ、コントラスト、グロー、HUDスケール、スキャンラインの調整をサポート

## ローカルで実行

`localhost` または HTTPS 経由で配信してください。ファイルを直接開かないでください。

Code for FUKUI の `liveserver` を使用します:

- https://github.com/code4fukui/liveserver

```bash
cd /Users/fukuno/data/js/webvr/arglass-sim
liveserver
```

その後、以下を開いてください:

```text
http://localhost:8080
```

## WebXRに関する注意点

- `immersive-ar` はWebXR ARサポートのあるブラウザとデバイスが必要です。
- カメラパススルーは実際のARセッション内でのみ利用可能です。
- デスクトップブラウザの多くはフォールバックシミュレータでのみ動作します。
- 方位表示は起動時の方向を基準にしており、真の磁北ではありません。

## コントロール

HTMLではランチャーUIがデフォルトで非表示になっていますが、コントロール要素自体はページ内に存在します:

- `Brightness`
- `Contrast`
- `Glow`
- `HUD Scale`
- `Scanlines`

フォールバックシミュレータの操作:

- マウスまたはタッチでドラッグして周囲を見回す

## 調整

モノクロの外観は主に以下の要素で制御されます:

- モジュール上部の `appearance`
- `computeGreenPalette()`
- `applyMonochromeAppearance()`
- `drawHudBox()` および `drawHudLine()`
- 実際の `640x480` HUD描画を行う `updateHud()`

効果を強調するには:

- `brightness` を上げる
- `contrast` を上げる
- `glow` を上げる
- `lineThickness` を上げる
- `scanlines` を有効にしたままにする

効果を控えめにするには:

- `glow` を下げる
- `contrast` を下げる
- `scanlines` を無効にする
- `applyMonochromeAppearance()` 内のフォールバック用CSSの `drop-shadow()` と `contrast()` を減らす

## 構造

`ARGlassSim.js` は以下の構成で整理されています:

- XR/セッションのセットアップ
- HUDキャンバスの作成
- グリーンモノクロの外観制御
- フォールバックシミュレータモード
- 1フレームごとのHUD描画

`index.html` は現在、`new ARGlassSim(...).start()` を呼び出すだけの薄いデモシェルです。

`sample.html` は、このモジュールをベースにしたアプリケーション開発の参考となる形です。
