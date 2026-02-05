/**
 * blocker.js - Block puzzle visualization
 *
 * Renders the 3x3x3 cube solutions with:
 * - Orbit camera controls (drag to rotate)
 * - Zoom via slider
 * - Explosion via scroll
 */

// ============================================================
// SOLUTION DATA
// ============================================================

// Solutions are loaded from solutions-data.js (generated via `blocker export-js`)

// The 7 puzzle pieces (same as Rust PIECES constant)
const PIECES = [
  [[0,0,0], [1,0,0], [2,0,0], [0,1,0]],       // L-shaped (4 cubes)
  [[0,0,0], [1,0,0], [2,0,0], [1,1,0]],       // T-shaped (4 cubes)
  [[0,0,0], [1,0,0], [1,1,0], [2,1,0]],       // S-shaped (4 cubes)
  [[0,0,0], [1,0,0], [0,1,0]],                 // Small L (3 cubes)
  [[0,0,0], [1,0,0], [0,1,0], [1,0,1]],       // 3D corner A (4 cubes)
  [[0,0,0], [1,0,0], [0,1,0], [0,0,1]],       // 3D corner B (4 cubes)
  [[0,0,0], [1,0,0], [0,1,0], [0,1,1]],       // 3D corner C (4 cubes)
];

// Piece colors
const PIECE_COLORS = [
  [0.95, 0.30, 0.25], // red
  [0.30, 0.75, 0.35], // green
  [0.30, 0.45, 0.90], // blue
  [0.95, 0.85, 0.25], // yellow
  [0.80, 0.35, 0.75], // magenta
  [0.25, 0.80, 0.80], // cyan
  [0.95, 0.55, 0.20], // orange
];

// Wood-like colors for intro visualization
const WOOD_COLORS = [
  [0.76, 0.60, 0.42],
  [0.65, 0.50, 0.35],
  [0.55, 0.40, 0.28],
  [0.70, 0.55, 0.38],
  [0.60, 0.45, 0.32],
  [0.72, 0.58, 0.40],
  [0.58, 0.42, 0.30],
];

// 24 rotation matrices for cube orientations
const ROTATIONS = [
  // +Z up, rotations around Z
  (x,y,z) => [x, y, z],
  (x,y,z) => [-y, x, z],
  (x,y,z) => [-x, -y, z],
  (x,y,z) => [y, -x, z],
  // +Y up
  (x,y,z) => [x, -z, y],
  (x,y,z) => [z, x, y],
  (x,y,z) => [-x, z, y],
  (x,y,z) => [-z, -x, y],
  // -Z up
  (x,y,z) => [x, -y, -z],
  (x,y,z) => [y, x, -z],
  (x,y,z) => [-x, y, -z],
  (x,y,z) => [-y, -x, -z],
  // -Y up
  (x,y,z) => [x, z, -y],
  (x,y,z) => [-z, x, -y],
  (x,y,z) => [-x, -z, -y],
  (x,y,z) => [z, -x, -y],
  // +X up
  (x,y,z) => [z, y, -x],
  (x,y,z) => [-y, z, -x],
  (x,y,z) => [-z, -y, -x],
  (x,y,z) => [y, -z, -x],
  // -X up
  (x,y,z) => [-z, y, x],
  (x,y,z) => [-y, -z, x],
  (x,y,z) => [z, -y, x],
  (x,y,z) => [y, z, x],
];

// ============================================================
// SHADERS
// ============================================================

const VERTEX_SHADER = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec3 aColor;

  uniform mat4 uProjection;
  uniform mat4 uView;
  uniform mat4 uModel;

  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec3 vPosition;

  void main() {
    vec4 worldPos = uModel * vec4(aPosition, 1.0);
    vPosition = worldPos.xyz;
    vNormal = mat3(uModel) * aNormal;
    vColor = aColor;
    gl_Position = uProjection * uView * worldPos;
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;

  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec3 vPosition;

  uniform vec3 uLightDir;
  uniform vec3 uLightDir2;
  uniform vec3 uEyePos;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(uEyePos - vPosition);

    vec3 lightDir1 = normalize(uLightDir);
    vec3 lightDir2 = normalize(uLightDir2);

    float ambient = 0.4;
    float diff1 = max(dot(normal, lightDir1), 0.0);
    float diff2 = max(dot(normal, lightDir2), 0.0) * 0.5;

    vec3 halfDir = normalize(lightDir1 + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 64.0) * 0.15;

    float rim = 1.0 - max(dot(viewDir, normal), 0.0);
    rim = smoothstep(0.4, 1.0, rim) * 0.15;

    vec3 result = vColor * (ambient + diff1 * 0.5 + diff2 * 0.25) + vec3(spec + rim);
    result = pow(result, vec3(0.95));

    gl_FragColor = vec4(result, 1.0);
  }
`;

// ============================================================
// CUBE GEOMETRY
// ============================================================

function createCubeGeometry() {
  const s = 0.45;
  const positions = [];
  const normals = [];

  const faces = [
    { verts: [[-s,-s,s], [s,-s,s], [s,s,s], [-s,-s,s], [s,s,s], [-s,s,s]], normal: [0,0,1] },
    { verts: [[s,-s,-s], [-s,-s,-s], [-s,s,-s], [s,-s,-s], [-s,s,-s], [s,s,-s]], normal: [0,0,-1] },
    { verts: [[-s,s,s], [s,s,s], [s,s,-s], [-s,s,s], [s,s,-s], [-s,s,-s]], normal: [0,1,0] },
    { verts: [[-s,-s,-s], [s,-s,-s], [s,-s,s], [-s,-s,-s], [s,-s,s], [-s,-s,s]], normal: [0,-1,0] },
    { verts: [[s,-s,s], [s,-s,-s], [s,s,-s], [s,-s,s], [s,s,-s], [s,s,s]], normal: [1,0,0] },
    { verts: [[-s,-s,-s], [-s,-s,s], [-s,s,s], [-s,-s,-s], [-s,s,s], [-s,s,-s]], normal: [-1,0,0] },
  ];

  for (const face of faces) {
    for (const vert of face.verts) {
      positions.push(...vert);
      normals.push(...face.normal);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    vertexCount: 36
  };
}

// ============================================================
// BASE RENDERER
// ============================================================

class CubeRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { antialias: true });
    if (!this.gl) {
      console.error('WebGL not supported');
      return;
    }

    this.explodeAmount = 0;
    this.useWoodColors = options.useWoodColors || false;

    // Create camera
    const cameraOptions = {
      distance: options.distance || 8,
      rotationX: options.rotationX || 0.4,
      rotationY: options.rotationY || 0.8,
      minDistance: options.minDistance || 3,
      maxDistance: options.maxDistance || 15,
      scrollOrbit: options.scrollOrbit !== false, // enabled by default
      scrollOrbitAmount: options.scrollOrbitAmount || 0.3,
    };

    // Enable pinch-to-explode on touch devices (onScroll used by pinch gesture)
    if (options.enablePinchExplode) {
      cameraOptions.onScroll = (deltaY) => {
        this.explodeAmount -= deltaY * 0.002;
        this.explodeAmount = Math.max(0, Math.min(2, this.explodeAmount));
      };
      // Don't capture wheel - use slider on desktop instead
      cameraOptions.captureWheel = false;
    }

    this.camera = new OrbitCamera(canvas, cameraOptions);

    this._initGL();
    this._initGeometry();
  }

  _initGL() {
    const gl = this.gl;

    this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    if (!this.program) return;

    this.aPosition = gl.getAttribLocation(this.program, 'aPosition');
    this.aNormal = gl.getAttribLocation(this.program, 'aNormal');
    this.aColor = gl.getAttribLocation(this.program, 'aColor');

    this.uProjection = gl.getUniformLocation(this.program, 'uProjection');
    this.uView = gl.getUniformLocation(this.program, 'uView');
    this.uModel = gl.getUniformLocation(this.program, 'uModel');
    this.uLightDir = gl.getUniformLocation(this.program, 'uLightDir');
    this.uLightDir2 = gl.getUniformLocation(this.program, 'uLightDir2');
    this.uEyePos = gl.getUniformLocation(this.program, 'uEyePos');

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0.96, 0.96, 0.96, 1.0);
  }

  _initGeometry() {
    const gl = this.gl;
    const cube = createCubeGeometry();

    this.cubeVertexCount = cube.vertexCount;

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, cube.positions, gl.STATIC_DRAW);

    this.normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, cube.normals, gl.STATIC_DRAW);
  }

  setZoom(value) {
    // value is 0-100, map to distance range
    const minDist = this.camera.minDistance;
    const maxDist = this.camera.maxDistance;
    this.camera.distance = maxDist - (value / 100) * (maxDist - minDist);
  }

  setExplode(amount) {
    this.explodeAmount = amount;
  }

  _setupFrame() {
    const gl = this.gl;
    if (!gl || !this.program) return false;

    resizeCanvasToDisplaySize(this.canvas);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.program);

    const aspect = this.canvas.width / this.canvas.height;
    const projection = Mat4.perspective(Mat4.create(), Math.PI / 4, aspect, 0.1, 100);
    const view = this.camera.getViewMatrix();
    const eyePos = this.camera.getEyePosition();

    gl.uniformMatrix4fv(this.uProjection, false, projection);
    gl.uniformMatrix4fv(this.uView, false, view);
    gl.uniform3f(this.uLightDir, 0.7, 1.0, 0.5);
    gl.uniform3f(this.uLightDir2, -0.5, 0.3, 0.8);
    gl.uniform3fv(this.uEyePos, eyePos);

    return true;
  }

  _drawCube(x, y, z, color) {
    const gl = this.gl;

    const model = Mat4.create();
    Mat4.translate(model, model, Vec3.create(x, y, z));

    gl.uniformMatrix4fv(this.uModel, false, model);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.aPosition);
    gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.enableVertexAttribArray(this.aNormal);
    gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);

    gl.disableVertexAttribArray(this.aColor);
    gl.vertexAttrib3f(this.aColor, color[0], color[1], color[2]);

    gl.drawArrays(gl.TRIANGULAR, 0, this.cubeVertexCount);
  }
}

// ============================================================
// SOLUTION RENDERER
// ============================================================

class SolutionRenderer extends CubeRenderer {
  constructor(canvas, options = {}) {
    super(canvas, options);
    this.currentSolution = 0;
  }

  setSolution(index) {
    this.currentSolution = index;
  }

  render() {
    if (!this._setupFrame()) return;
    const gl = this.gl;

    const solution = SOLUTIONS[this.currentSolution];
    const colors = this.useWoodColors ? WOOD_COLORS : PIECE_COLORS;

    for (const [pieceIndex, cubes] of solution) {
      const color = colors[pieceIndex];

      // Compute piece centroid
      let cx = 0, cy = 0, cz = 0;
      for (const [x, y, z] of cubes) {
        cx += x; cy += y; cz += z;
      }
      cx /= cubes.length;
      cy /= cubes.length;
      cz /= cubes.length;

      // Explosion direction
      const dx = cx - 1, dy = cy - 1, dz = cz - 1;
      const len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
      const ex = dx / len, ey = dy / len, ez = dz / len;

      for (const [x, y, z] of cubes) {
        const px = (x - 1) + ex * this.explodeAmount;
        const py = (y - 1) + ey * this.explodeAmount;
        const pz = (z - 1) + ez * this.explodeAmount;

        const model = Mat4.create();
        Mat4.translate(model, model, Vec3.create(px, py, pz));
        gl.uniformMatrix4fv(this.uModel, false, model);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(this.aPosition);
        gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.enableVertexAttribArray(this.aNormal);
        gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);

        gl.disableVertexAttribArray(this.aColor);
        gl.vertexAttrib3f(this.aColor, color[0], color[1], color[2]);

        gl.drawArrays(gl.TRIANGLES, 0, this.cubeVertexCount);
      }
    }
  }
}

// ============================================================
// PIECES RENDERER (shows all 7 pieces laid out)
// ============================================================

class PiecesRenderer extends CubeRenderer {
  constructor(canvas, options = {}) {
    super(canvas, { ...options, distance: 12, minDistance: 6, maxDistance: 20 });
  }

  render() {
    if (!this._setupFrame()) return;
    const gl = this.gl;

    // Layout: 4 pieces on top row, 3 on bottom
    const offsets = [
      [-4.5, 1.5, 0], [-1.5, 1.5, 0], [1.5, 1.5, 0], [4.5, 1.5, 0],
      [-3, -1.5, 0], [0, -1.5, 0], [3, -1.5, 0]
    ];

    for (let pieceIdx = 0; pieceIdx < PIECES.length; pieceIdx++) {
      const piece = PIECES[pieceIdx];
      const color = PIECE_COLORS[pieceIdx];
      const [ox, oy, oz] = offsets[pieceIdx];

      // Center the piece
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of piece) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      for (const [x, y, z] of piece) {
        const px = ox + (x - centerX);
        const py = oy + (y - centerY);
        const pz = oz + z;

        const model = Mat4.create();
        Mat4.translate(model, model, Vec3.create(px, py, pz));
        gl.uniformMatrix4fv(this.uModel, false, model);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(this.aPosition);
        gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.enableVertexAttribArray(this.aNormal);
        gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);

        gl.disableVertexAttribArray(this.aColor);
        gl.vertexAttrib3f(this.aColor, color[0], color[1], color[2]);

        gl.drawArrays(gl.TRIANGLES, 0, this.cubeVertexCount);
      }
    }
  }
}

// ============================================================
// ROTATIONS RENDERER (shows one piece in different orientations)
// ============================================================

class RotationsRenderer extends CubeRenderer {
  constructor(canvas, options = {}) {
    super(canvas, { ...options, distance: 5, minDistance: 3, maxDistance: 10 });
    this.rotationIndex = 0;
    this.pieceIndex = 0; // L-shaped piece
  }

  setRotation(index) {
    this.rotationIndex = index;
  }

  render() {
    if (!this._setupFrame()) return;
    const gl = this.gl;

    const piece = PIECES[this.pieceIndex];
    const color = PIECE_COLORS[this.pieceIndex];
    const rotate = ROTATIONS[this.rotationIndex];

    // Apply rotation to piece coordinates
    const rotatedPiece = piece.map(([x, y, z]) => rotate(x, y, z));

    // Center the rotated piece
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const [x, y, z] of rotatedPiece) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;

    for (const [x, y, z] of rotatedPiece) {
      const model = Mat4.create();
      Mat4.translate(model, model, Vec3.create(x - cx, y - cy, z - cz));
      gl.uniformMatrix4fv(this.uModel, false, model);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.enableVertexAttribArray(this.aPosition);
      gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
      gl.enableVertexAttribArray(this.aNormal);
      gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);

      gl.disableVertexAttribArray(this.aColor);
      gl.vertexAttrib3f(this.aColor, color[0], color[1], color[2]);

      gl.drawArrays(gl.TRIANGLES, 0, this.cubeVertexCount);
    }
  }
}

// ============================================================
// CANONICAL RENDERER (shows solution + reflection rotated 24 ways)
// ============================================================

// Note: canonical visualization shows geometry reflection only (no color swapping).

class CanonicalRenderer extends CubeRenderer {
  constructor(canvas, options = {}) {
    super(canvas, { ...options, distance: 10, minDistance: 6, maxDistance: 16 });
    this.rotationIndex = 0;
  }

  setRotation(index) {
    this.rotationIndex = index;
  }

  _renderSolution(solution, offsetX, reflect = false) {
    const gl = this.gl;
    const rotate = ROTATIONS[this.rotationIndex];

    for (const [pieceIndex, cubes] of solution) {
      const color = PIECE_COLORS[pieceIndex];

      for (const [x, y, z] of cubes) {
        // Center at 1,1,1 then mirror across the x=1 plane (if needed), then rotate
        let cx = x - 1, cy = y - 1, cz = z - 1;
        if (reflect) cx = -cx;
        const [rx, ry, rz] = rotate(cx, cy, cz);

        const model = Mat4.create();
        Mat4.translate(model, model, Vec3.create(rx + offsetX, ry, rz));
        gl.uniformMatrix4fv(this.uModel, false, model);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(this.aPosition);
        gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.enableVertexAttribArray(this.aNormal);
        gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);

        gl.disableVertexAttribArray(this.aColor);
        gl.vertexAttrib3f(this.aColor, color[0], color[1], color[2]);

        gl.drawArrays(gl.TRIANGLES, 0, this.cubeVertexCount);
      }
    }
  }

  render() {
    if (!this._setupFrame()) return;

    const solution = SOLUTIONS[0];

    // Original solution (left) and mirror reflection (right)
    this._renderSolution(solution, -2.5, false);
    this._renderSolution(solution, 2.5, true);
  }
}

// ============================================================
// BACKTRACKING RENDERER (animated search visualization)
// ============================================================

class BacktrackRenderer extends CubeRenderer {
  constructor(canvas, options = {}) {
    super(canvas, options);
    this.step = 0;
    this.maxSteps = 100;
    this.playing = false;

    // Pre-generate some "search states" for visualization
    this._generateStates();
  }

  _generateStates() {
    // Generate intermediate states showing pieces being placed
    // Always start with at least 1 piece so we never show a blank screen
    this.states = [];
    const solution = SOLUTIONS[0];

    for (let i = 1; i <= solution.length; i++) {
      this.states.push(solution.slice(0, i));
    }
    this.maxSteps = this.states.length - 1;
  }

  setStep(step) {
    this.step = Math.max(0, Math.min(step, this.maxSteps));
  }

  render() {
    if (!this._setupFrame()) return;
    const gl = this.gl;

    const stateIndex = Math.max(0, Math.min(Math.floor(this.step), this.states.length - 1));
    const state = this.states[stateIndex] || this.states[this.states.length - 1] || [];

    for (const [pieceIndex, cubes] of state) {
      const color = PIECE_COLORS[pieceIndex];

      for (const [x, y, z] of cubes) {
        const model = Mat4.create();
        Mat4.translate(model, model, Vec3.create(x - 1, y - 1, z - 1));
        gl.uniformMatrix4fv(this.uModel, false, model);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(this.aPosition);
        gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.enableVertexAttribArray(this.aNormal);
        gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);

        gl.disableVertexAttribArray(this.aColor);
        gl.vertexAttrib3f(this.aColor, color[0], color[1], color[2]);

        gl.drawArrays(gl.TRIANGLES, 0, this.cubeVertexCount);
      }
    }

    // Draw wireframe for empty grid
    // (simplified: just draw nothing for now, could add wireframe later)
  }
}

// ============================================================
// WEBGL DETECTION
// ============================================================

function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch (e) {
    return false;
  }
}

// ============================================================
// INITIALIZATION
// ============================================================

function setupVisualization(canvasId, RendererClass, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const container = canvas.parentElement;

  // Check for WebGL support
  if (!isWebGLAvailable()) {
    container.classList.add('webgl-unavailable');
    return null;
  }

  // Responsive sizing with aspect ratio preservation
  function updateCanvasSize() {
    const containerWidth = container.clientWidth;
    const isMobile = window.innerWidth <= 600;
    // Shorter on mobile, maintain aspect ratio
    const height = isMobile
      ? Math.min(280, containerWidth * 0.75)
      : Math.min(400, containerWidth * 0.55);
    canvas.style.width = '100%';
    canvas.style.height = height + 'px';
  }

  updateCanvasSize();

  // Use ResizeObserver for efficient resize handling
  if (typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });
    resizeObserver.observe(container);
  } else {
    // Fallback for older browsers
    window.addEventListener('resize', updateCanvasSize);
  }

  const renderer = new RendererClass(canvas, options);

  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  const loop = new AnimationLoop(() => {
    renderer.render();
  });

  // Only auto-animate if motion is allowed
  if (!prefersReducedMotion) {
    loop.start();
  } else {
    // Render once for static display
    renderer.render();
  }

  return renderer;
}

document.addEventListener('DOMContentLoaded', () => {
  // ---- Intro visualization (wood colors) ----
  const introRenderer = setupVisualization('intro-canvas', SolutionRenderer, {
    useWoodColors: true,
    enablePinchExplode: true,
    distance: 7,
    rotationX: 0.35,
    rotationY: 0.6
  });
  if (introRenderer) {
    const explodeSlider = document.getElementById('intro-explode');
    if (explodeSlider) {
      explodeSlider.addEventListener('input', (e) => {
        introRenderer.setExplode(parseInt(e.target.value) / 50); // 0-100 -> 0-2
      });
    }
  }

  // ---- Pieces visualization ----
  const piecesRenderer = setupVisualization('pieces-canvas', PiecesRenderer, {
    rotationX: 0.3,
    rotationY: 0.2
  });

  // ---- Rotations visualization ----
  const rotationsRenderer = setupVisualization('rotations-canvas', RotationsRenderer, {
    rotationX: 0.4,
    rotationY: 0.5
  });
  if (rotationsRenderer) {
    const prevBtn = document.getElementById('prev-rotation');
    const nextBtn = document.getElementById('next-rotation');
    const label = document.getElementById('rotation-label');
    let currentRotation = 0;

    function updateRotationLabel() {
      if (label) label.textContent = `Orientation ${currentRotation + 1} / 24`;
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        currentRotation = (currentRotation - 1 + 24) % 24;
        rotationsRenderer.setRotation(currentRotation);
        updateRotationLabel();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        currentRotation = (currentRotation + 1) % 24;
        rotationsRenderer.setRotation(currentRotation);
        updateRotationLabel();
      });
    }
  }

  // ---- Backtracking visualization (auto-plays) ----
  const backtrackRenderer = setupVisualization('backtrack-canvas', BacktrackRenderer, {
    distance: 9,
    rotationX: 0.4,
    rotationY: 0.7
  });
  if (backtrackRenderer) {
    const slider = document.getElementById('backtrack-slider');

    if (slider) {
      slider.max = backtrackRenderer.maxSteps;
      slider.addEventListener('input', (e) => {
        backtrackRenderer.setStep(parseInt(e.target.value));
      });
    }

    // Auto-play animation on loop
    let animStep = 0;
    setInterval(() => {
      animStep += 0.1;
      if (animStep > backtrackRenderer.maxSteps + 3) {
        animStep = 0; // Loop back to start after pausing on complete state
      }
      backtrackRenderer.setStep(Math.min(animStep, backtrackRenderer.maxSteps));
      if (slider) slider.value = Math.floor(Math.min(animStep, backtrackRenderer.maxSteps));
    }, 50);
  }

  // ---- Canonical visualization ----
  const canonicalRenderer = setupVisualization('canonical-canvas', CanonicalRenderer, {
    distance: 6,
    rotationX: 0.4,
    rotationY: 0.6
  });
  if (canonicalRenderer) {
    const slider = document.getElementById('canonical-slider');
    const label = document.getElementById('canonical-label');
    if (slider) {
      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        canonicalRenderer.setRotation(val);
        if (label) label.textContent = `${val + 1} / 24`;
      });
    }
  }

  // ---- Main solution visualization ----
  const solutionRenderer = setupVisualization('solution-canvas', SolutionRenderer, {
    useWoodColors: false,
    enablePinchExplode: true,
    distance: 7,
    rotationX: 0.4,
    rotationY: 0.8
  });
  if (solutionRenderer) {
    const explodeSlider = document.getElementById('solution-explode');
    if (explodeSlider) {
      explodeSlider.addEventListener('input', (e) => {
        solutionRenderer.setExplode(parseInt(e.target.value) / 50); // 0-100 -> 0-2
      });
    }
    // Solution navigation
    const prevBtn = document.getElementById('prev-solution');
    const nextBtn = document.getElementById('next-solution');
    const solutionLabel = document.getElementById('solution-label');
    let currentSolution = 0;
    const totalSolutions = SOLUTIONS.length;

    function updateSolutionLabel() {
      if (solutionLabel) {
        solutionLabel.textContent = `Solution ${currentSolution + 1} of ${totalSolutions}`;
      }
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        currentSolution = (currentSolution - 1 + totalSolutions) % totalSolutions;
        solutionRenderer.setSolution(currentSolution);
        updateSolutionLabel();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        currentSolution = (currentSolution + 1) % totalSolutions;
        solutionRenderer.setSolution(currentSolution);
        updateSolutionLabel();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        currentSolution = (currentSolution - 1 + totalSolutions) % totalSolutions;
        solutionRenderer.setSolution(currentSolution);
        updateSolutionLabel();
      } else if (e.key === 'ArrowRight') {
        currentSolution = (currentSolution + 1) % totalSolutions;
        solutionRenderer.setSolution(currentSolution);
        updateSolutionLabel();
      }
    });
  }
});
