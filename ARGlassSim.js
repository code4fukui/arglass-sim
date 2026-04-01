export class ARGlassSim {
  constructor(options) {
    const {
      THREE,
      ARButton = null,
      mount,
      launcher = null,
      touchHint = null,
      xrButtonHost = null,
      scanlinesEl = null,
      controls = {},
      valueLabelRoot = document,
      appearance = {},
      hud = {},
    } = options ?? {};

    if (!THREE) throw new Error('ARGlassSim requires THREE.');
    if (!mount) throw new Error('ARGlassSim requires a mount element.');

    this.THREE = THREE;
    this.ARButton = ARButton;
    this.mount = mount;
    this.launcher = launcher;
    this.touchHint = touchHint;
    this.xrButtonHost = xrButtonHost;
    this.scanlinesEl = scanlinesEl;
    this.valueLabelRoot = valueLabelRoot;

    const controlsRoot = this.valueLabelRoot?.getElementById ? this.valueLabelRoot : document;
    const resolvedControls = controls ?? {};
    this.controls = {
      brightness: resolvedControls.brightness ?? controlsRoot.getElementById('brightness') ?? null,
      contrast: resolvedControls.contrast ?? controlsRoot.getElementById('contrast') ?? null,
      glow: resolvedControls.glow ?? controlsRoot.getElementById('glow') ?? null,
      lineThickness: resolvedControls.lineThickness ?? controlsRoot.getElementById('lineThickness') ?? null,
      scanlines: resolvedControls.scanlines ?? controlsRoot.getElementById('scanlineToggle') ?? null,
      startSimButton: resolvedControls.startSimButton ?? controlsRoot.getElementById('startSimButton') ?? null,
    };

    this.appearance = {
      brightness: 1.05,
      contrast: 1.15,
      glow: 0.45,
      lineThickness: 1.2,
      scanlines: true,
      wireframe: true,
      ...appearance,
    };

    this.hudConfig = {
      width: 640,
      height: 480,
      distance: 1.5,
      horizontalFovDeg: 30,
      ...hud,
    };

    this.hudWorldWidth = 2 * this.hudConfig.distance * Math.tan(
      THREE.MathUtils.degToRad(this.hudConfig.horizontalFovDeg * 0.5)
    );
    this.hudWorldHeight = this.hudWorldWidth * (this.hudConfig.height / this.hudConfig.width);
    this.hudVerticalFovDeg = THREE.MathUtils.radToDeg(
      2 * Math.atan((this.hudWorldHeight * 0.5) / this.hudConfig.distance)
    );

    this.tempColor = new THREE.Color();
    this.clock = new THREE.Clock();
    this.timeState = { elapsed: 0 };
    this.worldDirection = new THREE.Vector3();
    this.hudEuler = new THREE.Euler();

    this.fallbackModeActive = false;
    this.xrSupported = false;
    this.rendererCanvasFilter = '';
    this.headingReferenceDeg = null;
    this.disposed = false;

    this.boundUpdateAppearanceFromUI = this.updateAppearanceFromUI.bind(this);
    this.boundStartFallbackMode = this.startFallbackMode.bind(this);
    this.boundRenderFrame = this.renderFrame.bind(this);
    this.boundOnResize = this.onResize.bind(this);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.mount.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      this.hudVerticalFovDeg,
      window.innerWidth / window.innerHeight,
      0.01,
      60
    );
    this.camera.position.set(0, 1.6, 0);

    this.pointerState = {
      dragging: false,
      pointerId: null,
      lastX: 0,
      lastY: 0,
      yaw: 0,
      pitch: -0.05,
    };
    this.pointerHandlers = {};
    this.controlListeners = [];

    this.hud = this.createHud();
  }

  start() {
    if (this.controls.brightness) this.controls.brightness.value = this.appearance.brightness;
    if (this.controls.contrast) this.controls.contrast.value = this.appearance.contrast;
    if (this.controls.glow) this.controls.glow.value = this.appearance.glow;
    if (this.controls.lineThickness) this.controls.lineThickness.value = this.appearance.lineThickness;
    if (this.controls.scanlines) this.controls.scanlines.checked = this.appearance.scanlines;

    this.setupControls();
    this.setupXRButton();
    this.applyMonochromeAppearance();
    this.onResize();
    this.renderer.setAnimationLoop(this.boundRenderFrame);
    window.addEventListener('resize', this.boundOnResize);
    this.launcher?.classList.remove('hidden');
    return this;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.boundOnResize);

    for (const { element, type, listener } of this.controlListeners) {
      element.removeEventListener(type, listener);
    }
    this.controlListeners = [];

    const canvas = this.renderer.domElement;
    if (this.pointerHandlers.down) canvas.removeEventListener('pointerdown', this.pointerHandlers.down);
    if (this.pointerHandlers.move) canvas.removeEventListener('pointermove', this.pointerHandlers.move);
    if (this.pointerHandlers.up) canvas.removeEventListener('pointerup', this.pointerHandlers.up);
    if (this.pointerHandlers.cancel) canvas.removeEventListener('pointercancel', this.pointerHandlers.cancel);

    this.renderer.dispose();
    this.hud.mesh.geometry.dispose();
    this.hud.mesh.material.dispose();
    this.hud.texture.dispose();
    canvas.remove();
  }

  formatValue(value) {
    return Number(value).toFixed(2);
  }

  updateValueLabels() {
    const targets = {
      brightness: this.controls.brightness,
      contrast: this.controls.contrast,
      glow: this.controls.glow,
      lineThickness: this.controls.lineThickness,
    };

    for (const [key, input] of Object.entries(targets)) {
      if (!input) continue;
      const target = this.valueLabelRoot.querySelector(`[data-value-for="${key}"]`);
      if (target) target.textContent = this.formatValue(input.value);
    }
  }

  updateAppearanceFromUI() {
    if (this.controls.brightness) this.appearance.brightness = parseFloat(this.controls.brightness.value);
    if (this.controls.contrast) this.appearance.contrast = parseFloat(this.controls.contrast.value);
    if (this.controls.glow) this.appearance.glow = parseFloat(this.controls.glow.value);
    if (this.controls.lineThickness) this.appearance.lineThickness = parseFloat(this.controls.lineThickness.value);
    if (this.controls.scanlines) this.appearance.scanlines = this.controls.scanlines.checked;
    this.applyMonochromeAppearance();
    this.updateValueLabels();
  }

  setAppearance(nextAppearance) {
    Object.assign(this.appearance, nextAppearance);
    if (this.controls.brightness) this.controls.brightness.value = this.appearance.brightness;
    if (this.controls.contrast) this.controls.contrast.value = this.appearance.contrast;
    if (this.controls.glow) this.controls.glow.value = this.appearance.glow;
    if (this.controls.lineThickness) this.controls.lineThickness.value = this.appearance.lineThickness;
    if (this.controls.scanlines) this.controls.scanlines.checked = this.appearance.scanlines;
    this.applyMonochromeAppearance();
    this.updateValueLabels();
  }

  clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }

  normalize360(deg) {
    return (deg % 360 + 360) % 360;
  }

  normalizeSigned180(deg) {
    return ((deg + 540) % 360) - 180;
  }

  computeGreenPalette() {
    const brightness = this.appearance.brightness;
    const contrast = this.appearance.contrast;
    const glow = this.appearance.glow;

    const core = this.clamp01(0.55 * contrast + 0.25 * brightness);
    const mid = this.clamp01(0.35 * contrast + 0.28 * brightness);
    const glowMix = this.clamp01(0.18 + glow * 0.32);

    return {
      line: this.tempColor.setRGB(0.08 * brightness, core, 0.18 * brightness).clone(),
      mesh: this.tempColor.setRGB(0.05 * brightness, mid, 0.13 * brightness).clone(),
      glow: this.tempColor
        .setRGB(0.07 * brightness, this.clamp01(core + glowMix * 0.28), 0.14 * brightness)
        .clone(),
    };
  }

  applyMonochromeAppearance() {
    const glowPx = `${Math.round(4 + this.appearance.glow * 18)}px`;
    document.documentElement.style.setProperty('--glow-size', glowPx);
    document.documentElement.style.setProperty(
      '--scanline-opacity',
      (this.appearance.scanlines ? 0.04 + this.appearance.glow * 0.08 : 0).toFixed(2)
    );
    if (this.scanlinesEl) {
      this.scanlinesEl.style.opacity = this.appearance.scanlines
        ? getComputedStyle(document.documentElement).getPropertyValue('--scanline-opacity')
        : '0';
    }

    const brightnessCss = (0.85 + this.appearance.brightness * 0.25).toFixed(2);
    const contrastCss = (0.85 + this.appearance.contrast * 0.35).toFixed(2);
    const dropShadowPx = Math.round(this.appearance.glow * 12);
    this.rendererCanvasFilter =
      `brightness(${brightnessCss}) contrast(${contrastCss}) ` +
      `drop-shadow(0 0 ${dropShadowPx}px rgba(90,255,140,0.35))`;
    this.renderer.domElement.style.filter = this.fallbackModeActive ? this.rendererCanvasFilter : '';
  }

  hudColorString(color, alpha = 1) {
    return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha})`;
  }

  drawHudBox(ctx, x, y, w, h, text, palette, fontScale = 1) {
    const strokeWidth = 2.4 + this.appearance.lineThickness * 2.2;
    const fontSize = (18 + this.appearance.lineThickness * 5) * fontScale;
    ctx.save();
    ctx.strokeStyle = this.hudColorString(palette.mesh, 0.22);
    ctx.lineWidth = strokeWidth;
    ctx.strokeRect(x, y, w, h);
    ctx.shadowColor = this.hudColorString(palette.glow, 0.35);
    ctx.shadowBlur = 10 + this.appearance.glow * 14;
    ctx.fillStyle = this.hudColorString(palette.line, 0.95);
    ctx.font = `bold ${fontSize}px Courier New`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    ctx.restore();
  }

  drawHudLine(ctx, x1, y1, x2, y2, width, palette, alpha = 1) {
    ctx.save();
    ctx.strokeStyle = this.hudColorString(palette.line, alpha);
    ctx.lineWidth = width;
    ctx.lineCap = 'butt';
    ctx.shadowColor = this.hudColorString(palette.glow, 0.32);
    ctx.shadowBlur = 8 + this.appearance.glow * 12;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  createHud() {
    const canvas = document.createElement('canvas');
    canvas.width = this.hudConfig.width;
    canvas.height = this.hudConfig.height;

    const texture = new this.THREE.CanvasTexture(canvas);
    texture.minFilter = this.THREE.NearestFilter;
    texture.magFilter = this.THREE.NearestFilter;
    texture.generateMipmaps = false;

    const material = new this.THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new this.THREE.Mesh(
      new this.THREE.PlaneGeometry(this.hudWorldWidth, this.hudWorldHeight),
      material
    );
    mesh.position.set(0, 0, -this.hudConfig.distance);
    this.camera.add(mesh);
    this.scene.add(this.camera);

    return {
      canvas,
      ctx: canvas.getContext('2d'),
      texture,
      mesh,
    };
  }

  addControlListener(element, type, listener) {
    element.addEventListener(type, listener);
    this.controlListeners.push({ element, type, listener });
  }

  setupControls() {
    this.updateAppearanceFromUI();

    const appearanceInputs = [
      this.controls.brightness,
      this.controls.contrast,
      this.controls.glow,
      this.controls.lineThickness,
    ].filter(Boolean);

    for (const input of appearanceInputs) {
      this.addControlListener(input, 'input', this.boundUpdateAppearanceFromUI);
    }
    if (this.controls.scanlines) {
      this.addControlListener(this.controls.scanlines, 'change', this.boundUpdateAppearanceFromUI);
    }
    if (this.controls.startSimButton) {
      this.addControlListener(this.controls.startSimButton, 'click', this.boundStartFallbackMode);
    }

    this.setupPointerLook();
  }

  async setupXRButton() {
    if (!this.xrButtonHost) return;

    this.xrButtonHost.innerHTML = '';

    if (!navigator.xr) {
      this.xrButtonHost.innerHTML = '<button type="button" disabled>AR Not Available</button>';
      return;
    }

    this.xrSupported = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);

    if (!this.xrSupported || !this.ARButton) {
      this.xrButtonHost.innerHTML = '<button type="button" disabled>AR Unsupported</button>';
      return;
    }

    const button = this.ARButton.createButton(this.renderer, {
      requiredFeatures: [],
      optionalFeatures: ['dom-overlay', 'local-floor'],
      domOverlay: { root: document.body },
    });
    button.classList.add('xr-button');
    button.textContent = 'Enter AR';
    this.xrButtonHost.appendChild(button);

    this.renderer.xr.addEventListener('sessionstart', () => {
      this.fallbackModeActive = false;
      this.headingReferenceDeg = null;
      this.launcher?.classList.add('hidden');
      this.renderer.domElement.style.filter = '';
      this.scene.background = null;
    });

    this.renderer.xr.addEventListener('sessionend', () => {
      this.launcher?.classList.remove('hidden');
      this.touchHint?.classList.toggle('visible', this.fallbackModeActive);
      this.renderer.domElement.style.filter = this.fallbackModeActive ? this.rendererCanvasFilter : '';
      this.scene.background = this.fallbackModeActive ? new this.THREE.Color(0x010301) : null;
    });
  }

  startFallbackMode() {
    this.fallbackModeActive = true;
    this.headingReferenceDeg = null;
    this.launcher?.classList.add('hidden');
    this.touchHint?.classList.add('visible');
    this.scene.background = new this.THREE.Color(0x010301);
    this.renderer.domElement.style.filter = this.rendererCanvasFilter;
  }

  renderFrame() {
    const dt = this.clock.getDelta();
    this.timeState.elapsed += dt;
    this.updateHud();
    this.renderer.render(this.scene, this.camera);
  }

  drawHudFrame({
    ctx,
    palette,
    lineWidth,
    relativeHeadingDeg,
    displayHeadingDeg,
    pitch,
    pitchDeg,
    roll,
    rollDeg,
    hh,
    mm,
    ss,
  }) {
    const tapeY = 118;
    const tapeLeft = 92;
    const tapeRight = 548;
    const pixelsPerDegree = 3.4;
    const hudCenterX = this.hudConfig.width / 2;
    const hudWidth = this.hudConfig.width;
    const bottomGap = 12;
    const timeBoxWidth = 160;
    const statusBoxWidth = 132;
    const bottomRowWidth = timeBoxWidth + statusBoxWidth * 3 + bottomGap * 3;
    const bottomBoxHeight = 44;
    const horizontalMargin = 12;
    const stackedLayout = bottomRowWidth > hudWidth - horizontalMargin * 2;
    const bottomY = stackedLayout ? 360 : 410;

    ctx.clearRect(0, 0, this.hudConfig.width, this.hudConfig.height);

    this.drawHudLine(ctx, 282, 240, 310, 240, lineWidth, palette);
    this.drawHudLine(ctx, 330, 240, 358, 240, lineWidth, palette);
    this.drawHudLine(ctx, 320, 202, 320, 230, lineWidth, palette);
    this.drawHudLine(ctx, 320, 250, 320, 278, lineWidth, palette);

    for (let degreeOffset = -120; degreeOffset <= 120; degreeOffset += 10) {
      const x = hudCenterX + (degreeOffset - relativeHeadingDeg) * pixelsPerDegree;
      if (x < tapeLeft || x > tapeRight) continue;
      const isMajor = degreeOffset % 30 === 0;
      this.drawHudLine(ctx, x, tapeY - 10, x, tapeY + (isMajor ? 28 : 16), lineWidth, palette, 0.92);
      if (!isMajor) continue;
      const labelDeg = this.normalize360(degreeOffset);
      ctx.save();
      ctx.fillStyle = this.hudColorString(palette.line, 0.95);
      ctx.shadowColor = this.hudColorString(palette.glow, 0.32);
      ctx.shadowBlur = 8 + this.appearance.glow * 12;
      ctx.font = `bold ${18 + this.appearance.lineThickness * 4}px Courier New`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(labelDeg).padStart(3, '0'), x, tapeY + 46);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(hudCenterX, 258 + this.THREE.MathUtils.clamp(pitch * 118, -82, 82));
    ctx.rotate(-roll);
    this.drawHudLine(ctx, -190, 0, -48, 0, lineWidth, palette);
    this.drawHudLine(ctx, 48, 0, 190, 0, lineWidth, palette);
    this.drawHudLine(ctx, -42, -18, -42, 18, lineWidth, palette);
    this.drawHudLine(ctx, 42, -18, 42, 18, lineWidth, palette);
    ctx.restore();

    if (stackedLayout) {
      const rowWidth = statusBoxWidth * 2 + bottomGap;
      const rowStartX = Math.round((hudWidth - rowWidth) / 2);
      this.drawHudBox(
        ctx,
        rowStartX,
        bottomY,
        statusBoxWidth,
        bottomBoxHeight,
        `HDG ${String(displayHeadingDeg).padStart(3, '0')}`,
        palette,
        0.92
      );
      this.drawHudBox(
        ctx,
        rowStartX + statusBoxWidth + bottomGap,
        bottomY,
        statusBoxWidth,
        bottomBoxHeight,
        `PIT ${pitchDeg >= 0 ? '+' : '-'}${String(Math.abs(pitchDeg)).padStart(2, '0')}`,
        palette,
        0.92
      );

      const secondRowWidth = timeBoxWidth + statusBoxWidth + bottomGap;
      const secondRowStartX = Math.round((hudWidth - secondRowWidth) / 2);
      this.drawHudBox(ctx, secondRowStartX, bottomY + bottomBoxHeight + bottomGap, timeBoxWidth, bottomBoxHeight, `${hh}:${mm}:${ss}`, palette, 0.88);
      this.drawHudBox(
        ctx,
        secondRowStartX + timeBoxWidth + bottomGap,
        bottomY + bottomBoxHeight + bottomGap,
        statusBoxWidth,
        bottomBoxHeight,
        `ROL ${rollDeg >= 0 ? '+' : '-'}${String(Math.abs(rollDeg)).padStart(2, '0')}`,
        palette,
        0.92
      );
      return;
    }

    const bottomStartX = Math.round((hudWidth - bottomRowWidth) / 2);
    this.drawHudBox(ctx, bottomStartX, bottomY, timeBoxWidth, bottomBoxHeight, `${hh}:${mm}:${ss}`, palette, 0.88);
    this.drawHudBox(
      ctx,
      bottomStartX + timeBoxWidth + bottomGap,
      bottomY,
      statusBoxWidth,
      bottomBoxHeight,
      `HDG ${String(displayHeadingDeg).padStart(3, '0')}`,
      palette,
      0.92
    );
    this.drawHudBox(
      ctx,
      bottomStartX + timeBoxWidth + bottomGap + statusBoxWidth + bottomGap,
      bottomY,
      statusBoxWidth,
      bottomBoxHeight,
      `PIT ${pitchDeg >= 0 ? '+' : '-'}${String(Math.abs(pitchDeg)).padStart(2, '0')}`,
      palette,
      0.92
    );
    this.drawHudBox(
      ctx,
      bottomStartX + timeBoxWidth + bottomGap + (statusBoxWidth + bottomGap) * 2,
      bottomY,
      statusBoxWidth,
      bottomBoxHeight,
      `ROL ${rollDeg >= 0 ? '+' : '-'}${String(Math.abs(rollDeg)).padStart(2, '0')}`,
      palette,
      0.92
    );
  }

  updateHud() {
    this.camera.getWorldDirection(this.worldDirection);
    const headingDeg = this.normalize360(
      Math.atan2(this.worldDirection.x, this.worldDirection.z) * this.THREE.MathUtils.RAD2DEG
    );
    if (this.headingReferenceDeg === null) this.headingReferenceDeg = headingDeg;
    const relativeHeadingDeg = this.normalizeSigned180(headingDeg - this.headingReferenceDeg);

    this.hudEuler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    const pitch = this.hudEuler.x;
    const roll = this.hudEuler.z;

    const displayHeadingDeg = Math.round(this.normalize360(relativeHeadingDeg));
    const pitchDeg = Math.round(this.THREE.MathUtils.radToDeg(pitch));
    const rollDeg = Math.round(this.THREE.MathUtils.radToDeg(roll));
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    const ctx = this.hud.ctx;
    const palette = this.computeGreenPalette();
    const lineWidth = Math.max(6, this.appearance.lineThickness * 4.5);
    this.drawHudFrame({
      ctx,
      palette,
      lineWidth,
      relativeHeadingDeg,
      displayHeadingDeg,
      pitch,
      pitchDeg,
      roll,
      rollDeg,
      hh,
      mm,
      ss,
    });

    this.hud.mesh.position.set(0, 0, -this.hudConfig.distance);
    this.hud.texture.needsUpdate = true;
  }

  setupPointerLook() {
    const canvas = this.renderer.domElement;

    this.pointerHandlers.down = (event) => {
      if (!this.fallbackModeActive) return;
      this.pointerState.dragging = true;
      this.pointerState.pointerId = event.pointerId;
      this.pointerState.lastX = event.clientX;
      this.pointerState.lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };

    this.pointerHandlers.move = (event) => {
      if (!this.fallbackModeActive) return;
      if (!this.pointerState.dragging || event.pointerId !== this.pointerState.pointerId) return;

      const dx = event.clientX - this.pointerState.lastX;
      const dy = event.clientY - this.pointerState.lastY;
      this.pointerState.lastX = event.clientX;
      this.pointerState.lastY = event.clientY;

      this.pointerState.yaw -= dx * 0.004;
      this.pointerState.pitch -= dy * 0.003;
      this.pointerState.pitch = this.THREE.MathUtils.clamp(this.pointerState.pitch, -1.1, 1.1);
      this.camera.rotation.set(this.pointerState.pitch, this.pointerState.yaw, 0, 'YXZ');
    };

    this.pointerHandlers.up = (event) => {
      if (event.pointerId !== this.pointerState.pointerId) return;
      this.pointerState.dragging = false;
      canvas.releasePointerCapture(event.pointerId);
    };

    this.pointerHandlers.cancel = this.pointerHandlers.up;

    canvas.addEventListener('pointerdown', this.pointerHandlers.down);
    canvas.addEventListener('pointermove', this.pointerHandlers.move);
    canvas.addEventListener('pointerup', this.pointerHandlers.up);
    canvas.addEventListener('pointercancel', this.pointerHandlers.cancel);
  }

  onResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const widthFitVerticalFovDeg = this.THREE.MathUtils.radToDeg(
      2 * Math.atan((this.hudWorldWidth * 0.5) / (this.hudConfig.distance * aspect))
    );

    this.camera.aspect = aspect;
    this.camera.fov = Math.max(this.hudVerticalFovDeg, widthFitVerticalFovDeg);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
