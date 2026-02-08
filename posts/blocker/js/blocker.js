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
  [0.88, 0.74, 0.54], // very light maple
  [0.76, 0.60, 0.42], // light oak
  [0.66, 0.50, 0.35], // medium oak
  [0.82, 0.66, 0.47], // honey
  [0.58, 0.43, 0.30], // medium walnut
  [0.50, 0.37, 0.25], // dark walnut
  [0.43, 0.31, 0.21], // deepest tone
];

// Per-piece grain variants so each piece reads like a distinct wood cut.
const WOOD_GRAIN_VARIANTS = [
  { scale: 3.0, angle: 0.18, shift: [0.00, 0.00], seed: 0.09, mix: 0.40 },
  { scale: 2.7, angle: 0.92, shift: [1.30, -0.70], seed: 0.27, mix: 0.43 },
  { scale: 3.35, angle: 1.56, shift: [-0.80, 1.10], seed: 0.43, mix: 0.38 },
  { scale: 2.85, angle: 2.12, shift: [0.70, 0.90], seed: 0.61, mix: 0.42 },
  { scale: 3.2, angle: 2.76, shift: [-1.40, 0.20], seed: 0.79, mix: 0.44 },
  { scale: 2.55, angle: 3.35, shift: [0.40, -1.30], seed: 0.18, mix: 0.39 },
  { scale: 3.45, angle: 4.05, shift: [1.10, 1.40], seed: 0.52, mix: 0.41 },
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

const ZERO_OFFSET = [0, 0, 0];

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
  uniform float uUseWoodGrain;
  uniform float uHighlightStrength;
  uniform vec2 uWoodShift;
  uniform float uWoodAngle;
  uniform float uWoodScale;
  uniform float uWoodSeed;
  uniform float uWoodMix;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      value += amp * noise(p);
      p = p * 2.03 + vec2(17.1, 9.2);
      amp *= 0.5;
    }
    return value;
  }

  vec3 applyWoodGrain(vec3 color, vec3 worldPos, vec3 normal) {
    float c = cos(uWoodAngle);
    float s = sin(uWoodAngle);

    vec2 base = worldPos.xz + uWoodShift;
    vec2 rot = vec2(c * base.x - s * base.y, s * base.x + c * base.y) * uWoodScale;

    float warp = fbm(rot * 0.85 + vec2(uWoodSeed * 3.7, -uWoodSeed * 2.9)) * 0.40;
    float lines = sin(rot.x * 9.5 + warp * 3.6 + uWoodSeed * 8.0);
    float lineMask = smoothstep(-0.05, 0.95, lines);

    float streak = fbm(rot * 2.1 + vec2(6.4 + uWoodSeed * 2.0, -4.2));
    float pores = noise(rot * 11.0 + vec2(uWoodSeed * 5.3, uWoodSeed * 4.1)) * 0.05;

    vec3 grainDir = normalize(vec3(c, 0.0, s));
    float endFacing = pow(abs(dot(normalize(normal), grainDir)), 3.0);
    float endRings = sin(length(rot + vec2(uWoodSeed * 2.0, -uWoodSeed * 1.7)) * 17.0 + warp * 2.5);
    float endMask = smoothstep(-0.10, 0.95, endRings) * endFacing * 0.06;

    float grain = 0.96 + lineMask * 0.07 + streak * 0.03 + endMask - pores;
    return mix(color, color * grain, uWoodMix);
  }

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

    if (uUseWoodGrain > 0.5) {
      result = applyWoodGrain(result, vPosition, normal);
    }

    if (uHighlightStrength > 0.0) {
      vec3 glow = vec3(1.0, 0.93, 0.78) * uHighlightStrength * 0.35;
      result = result + glow;
    }

    result = pow(result, vec3(0.95));
    result = clamp(result, 0.0, 1.0);

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

function projectWorldToScreen(world, view, projection, width, height) {
  const x = world[0];
  const y = world[1];
  const z = world[2];

  const vx = view[0] * x + view[4] * y + view[8] * z + view[12];
  const vy = view[1] * x + view[5] * y + view[9] * z + view[13];
  const vz = view[2] * x + view[6] * y + view[10] * z + view[14];
  const vw = view[3] * x + view[7] * y + view[11] * z + view[15];

  const cx = projection[0] * vx + projection[4] * vy + projection[8] * vz + projection[12] * vw;
  const cy = projection[1] * vx + projection[5] * vy + projection[9] * vz + projection[13] * vw;
  const cz = projection[2] * vx + projection[6] * vy + projection[10] * vz + projection[14] * vw;
  const cw = projection[3] * vx + projection[7] * vy + projection[11] * vz + projection[15] * vw;

  if (cw <= 0.0001) return null;

  const ndcX = cx / cw;
  const ndcY = cy / cw;
  const ndcZ = cz / cw;

  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (1 - (ndcY * 0.5 + 0.5)) * height,
    z: ndcZ,
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
    this.useWoodGrain = options.useWoodGrain || false;
    this._fovY = Math.PI / 4;
    this._timeSec = performance.now() / 1000;
    this._deltaTime = 0;

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
        const nextExplode = this.explodeAmount - deltaY * 0.002;
        this.setExplode(Math.max(0, Math.min(2, nextExplode)));
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
    this.uUseWoodGrain = gl.getUniformLocation(this.program, 'uUseWoodGrain');
    this.uHighlightStrength = gl.getUniformLocation(this.program, 'uHighlightStrength');
    this.uWoodShift = gl.getUniformLocation(this.program, 'uWoodShift');
    this.uWoodAngle = gl.getUniformLocation(this.program, 'uWoodAngle');
    this.uWoodScale = gl.getUniformLocation(this.program, 'uWoodScale');
    this.uWoodSeed = gl.getUniformLocation(this.program, 'uWoodSeed');
    this.uWoodMix = gl.getUniformLocation(this.program, 'uWoodMix');

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

    const nowSec = performance.now() / 1000;
    this._deltaTime = Math.max(0, Math.min(0.1, nowSec - this._timeSec));
    this._timeSec = nowSec;

    resizeCanvasToDisplaySize(this.canvas);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.program);

    const aspect = this.canvas.width / this.canvas.height;
    const projection = Mat4.perspective(Mat4.create(), this._fovY, aspect, 0.1, 100);
    const view = this.camera.getViewMatrix();
    const eyePos = this.camera.getEyePosition();

    gl.uniformMatrix4fv(this.uProjection, false, projection);
    gl.uniformMatrix4fv(this.uView, false, view);
    gl.uniform3f(this.uLightDir, 0.7, 1.0, 0.5);
    gl.uniform3f(this.uLightDir2, -0.5, 0.3, 0.8);
    gl.uniform3fv(this.uEyePos, eyePos);
    gl.uniform1f(this.uUseWoodGrain, this.useWoodGrain ? 1 : 0);
    gl.uniform1f(this.uHighlightStrength, 0);
    gl.uniform2f(this.uWoodShift, 0, 0);
    gl.uniform1f(this.uWoodAngle, 0);
    gl.uniform1f(this.uWoodScale, 3.0);
    gl.uniform1f(this.uWoodSeed, 0);
    gl.uniform1f(this.uWoodMix, 0.4);

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

  _beforeRenderSolution() {}

  _getPieceOffset(pieceIndex) {
    return ZERO_OFFSET;
  }

  _getPieceHighlight(pieceIndex) {
    return 0;
  }

  _getWoodParams(pieceIndex) { // eslint-disable-line no-unused-vars
    return {
      shift: [0, 0],
      angle: 0,
      scale: 3.0,
      seed: 0,
      mix: 0.4
    };
  }

  _getRenderPieces(solution, offsetResolver = null) {
    const colors = this.useWoodColors ? WOOD_COLORS : PIECE_COLORS;
    const renderPieces = [];

    for (const [pieceIndex, cubes] of solution) {
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
      const userOffset = offsetResolver
        ? offsetResolver(pieceIndex)
        : this._getPieceOffset(pieceIndex);
      const ox = ex * this.explodeAmount + userOffset[0];
      const oy = ey * this.explodeAmount + userOffset[1];
      const oz = ez * this.explodeAmount + userOffset[2];
      const renderCubes = [];

      for (const [x, y, z] of cubes) {
        renderCubes.push([
          (x - 1) + ox,
          (y - 1) + oy,
          (z - 1) + oz
        ]);
      }

      renderPieces.push({
        pieceIndex,
        color: colors[pieceIndex],
        center: [(cx - 1) + ox, (cy - 1) + oy, (cz - 1) + oz],
        cubes: renderCubes
      });
    }

    return renderPieces;
  }

  render() {
    if (!this._setupFrame()) return;
    const gl = this.gl;
    this._beforeRenderSolution();

    const solution = SOLUTIONS[this.currentSolution];
    const renderPieces = this._getRenderPieces(solution);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.aPosition);
    gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.enableVertexAttribArray(this.aNormal);
    gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);

    gl.disableVertexAttribArray(this.aColor);

    for (const piece of renderPieces) {
      const wood = this._getWoodParams(piece.pieceIndex);
      gl.uniform2f(this.uWoodShift, wood.shift[0], wood.shift[1]);
      gl.uniform1f(this.uWoodAngle, wood.angle);
      gl.uniform1f(this.uWoodScale, wood.scale);
      gl.uniform1f(this.uWoodSeed, wood.seed);
      gl.uniform1f(this.uWoodMix, wood.mix);

      gl.uniform1f(this.uHighlightStrength, this._getPieceHighlight(piece.pieceIndex));
      gl.vertexAttrib3f(this.aColor, piece.color[0], piece.color[1], piece.color[2]);

      for (const cube of piece.cubes) {
        const model = Mat4.create();
        Mat4.translate(model, model, Vec3.create(cube[0], cube[1], cube[2]));
        gl.uniformMatrix4fv(this.uModel, false, model);
        gl.drawArrays(gl.TRIANGLES, 0, this.cubeVertexCount);
      }
    }

    gl.uniform1f(this.uHighlightStrength, 0);
  }
}

// ============================================================
// INTRO RENDERER (hold-to-drag one piece, snap-back on release)
// ============================================================

class IntroRenderer extends SolutionRenderer {
  constructor(canvas, options = {}) {
    super(canvas, {
      ...options,
      useWoodGrain: options.useWoodGrain !== false,
    });

    this.holdThresholdMs = options.holdThresholdMs || 280;
    this.holdMoveThresholdPx = options.holdMoveThresholdPx || 8;
    this.pickRadiusPx = options.pickRadiusPx || 36;
    this._maxDragOffset = 2.5;
    this._bboxExcessThreshold = options.struggleBBoxExcessThreshold || 0.025;
    this._bboxSolvedThreshold = options.struggleSolvedThreshold || 0.015;
    this._recoveryAttemptThreshold = options.struggleAttemptThreshold || 2;
    this._reassemblePieceDuration = options.reassemblePieceDuration || 0.5;
    this._reassembleStagger = options.reassembleStagger || 0.055;
    this._movingFrameThreshold = options.movingFrameThreshold || 0.015;
    this._settleDelaySec = options.settleDelaySec || 0.12;
    this._reassembleMinVisibleSec = options.reassembleMinVisibleSec || 0.9;
    this._reassembleHideDelaySec = options.reassembleHideDelaySec || 0.35;
    this._reassembleHideExcessThreshold = options.reassembleHideExcessThreshold || 0.018;
    this._reassembleExplodeShowThreshold = options.reassembleExplodeShowThreshold || 0.04;
    this._reassembleExplodeHideThreshold = options.reassembleExplodeHideThreshold || 0.02;

    this._springStrength = options.physicsSpringStrength || 20.0;
    this._linearDamping = options.physicsDamping || 8.0;
    this._gravityStrength = options.physicsGravity || 0.8;
    this._collisionImpulse = options.collisionImpulse || 0.22;
    this._collisionVelocityScale = options.collisionVelocityScale || 0.5;
    this._collisionPush = options.collisionPush || 0.75;
    this._pairRestitution = options.pairRestitution || 0.06;
    this._touchEpsilon = options.touchEpsilon || 0.03;
    this._cubeSize = 0.9; // geometry side length: 2 * 0.45

    this.draggingPiece = -1;
    this.highlightedPiece = -1;
    this._pieceOffsets = Array.from({ length: PIECES.length }, () => [0, 0, 0]);
    this._pieceVelocities = Array.from({ length: PIECES.length }, () => [0, 0, 0]);
    this._lastMotionOffsets = Array.from({ length: PIECES.length }, () => [0, 0, 0]);
    this._dragVelocity = [0, 0, 0];
    this._lastDragMoveSec = 0;
    this._pressState = null;
    this._recoveryAttemptCount = 0;
    this._bboxExcess = 0;
    this._reassembleState = null;
    this._reassembleButton = null;
    this._reassembleButtonBound = false;
    this._reassembleButtonVisible = false;
    this._explodeSlider = null;
    this._settledStillTime = 0;
    this._reassembleVisibleSinceSec = 0;
    this._reassembleHideCandidateSinceSec = 0;

    this._bindInteractionEvents();
  }

  _beforeRenderSolution() {
    if (this._reassembleState) {
      this._stepReassembleAnimation();
      this._updateStruggleDetection();
      return;
    }

    const dt = this._deltaTime;
    if (dt <= 0) return;

    const substeps = Math.max(1, Math.min(4, Math.ceil(dt / 0.012)));
    const stepDt = dt / substeps;

    for (let step = 0; step < substeps; step++) {
      this._integratePieceMotion(stepDt);
      this._solvePieceCollisions(stepDt);
      this._trimTinyMotion();
    }

    this._updateStruggleDetection();
  }

  _getPieceOffset(pieceIndex) {
    return this._pieceOffsets[pieceIndex] || ZERO_OFFSET;
  }

  _getPieceHighlight(pieceIndex) {
    if (pieceIndex !== this.highlightedPiece) return 0;
    const pulse = 0.5 + 0.5 * Math.sin(this._timeSec * 8);
    return 0.35 + pulse * 0.35;
  }

  _getWoodParams(pieceIndex) {
    return WOOD_GRAIN_VARIANTS[pieceIndex] || WOOD_GRAIN_VARIANTS[0];
  }

  setReassembleButton(button) {
    this._reassembleButton = button || null;
    if (!this._reassembleButton) return;

    this._reassembleButton.hidden = true;
    this._reassembleButtonVisible = false;

    if (!this._reassembleButtonBound) {
      this._reassembleButton.addEventListener('click', () => {
        this.startReassembleAnimation();
      });
      this._reassembleButtonBound = true;
    }
  }

  setExplodeSlider(slider) {
    this._explodeSlider = slider || null;
    this._syncExplodeSlider();
  }

  setExplode(amount) {
    super.setExplode(amount);
    this._syncExplodeSlider();
  }

  startReassembleAnimation() {
    if (this._reassembleState) return;

    if (this.draggingPiece >= 0) {
      this._cancelHold(true);
    }

    const startOffsets = this._pieceOffsets.map((offset) => [offset[0], offset[1], offset[2]]);
    const sorted = startOffsets
      .map((offset, pieceIndex) => ({
        pieceIndex,
        magnitude: Math.hypot(offset[0], offset[1], offset[2]),
      }))
      .sort((a, b) => b.magnitude - a.magnitude);

    const delays = new Array(PIECES.length).fill(0);
    for (let rank = 0; rank < sorted.length; rank++) {
      delays[sorted[rank].pieceIndex] = rank * this._reassembleStagger;
    }

    this._reassembleState = {
      startTime: this._timeSec,
      startOffsets,
      delays,
      duration: this._reassemblePieceDuration,
      totalDuration: Math.max(
        this._reassemblePieceDuration,
        this._reassemblePieceDuration + Math.max(...delays)
      ),
      startExplodeAmount: this.explodeAmount,
    };

    for (const velocity of this._pieceVelocities) {
      velocity[0] = 0;
      velocity[1] = 0;
      velocity[2] = 0;
    }

    this._recoveryAttemptCount = 0;
    this._setReassembleButtonVisible(false);
  }

  _stepReassembleAnimation() {
    if (!this._reassembleState) return;

    const elapsed = this._timeSec - this._reassembleState.startTime;
    const explodeProgress = Math.min(1, Math.max(0, elapsed / this._reassembleState.totalDuration));
    const explodeEased = this._easeInOutCubic(explodeProgress);
    this.explodeAmount = this._reassembleState.startExplodeAmount * (1 - explodeEased);
    this._syncExplodeSlider();
    let allDone = true;

    for (let pieceIndex = 0; pieceIndex < PIECES.length; pieceIndex++) {
      const delay = this._reassembleState.delays[pieceIndex];
      const startOffset = this._reassembleState.startOffsets[pieceIndex];
      const velocity = this._pieceVelocities[pieceIndex];
      const offset = this._pieceOffsets[pieceIndex];
      const localT = (elapsed - delay) / this._reassembleState.duration;

      if (localT <= 0) {
        allDone = false;
        offset[0] = startOffset[0];
        offset[1] = startOffset[1];
        offset[2] = startOffset[2];
        velocity[0] = 0;
        velocity[1] = 0;
        velocity[2] = 0;
        continue;
      }

      if (localT >= 1) {
        offset[0] = 0;
        offset[1] = 0;
        offset[2] = 0;
        velocity[0] = 0;
        velocity[1] = 0;
        velocity[2] = 0;
        continue;
      }

      allDone = false;
      const eased = this._easeInOutCubic(localT);
      const inv = 1 - eased;
      offset[0] = startOffset[0] * inv;
      offset[1] = startOffset[1] * inv;
      offset[2] = startOffset[2] * inv;
      velocity[0] = 0;
      velocity[1] = 0;
      velocity[2] = 0;
    }

    if (allDone) {
      this._reassembleState = null;
      this.explodeAmount = 0;
      this._syncExplodeSlider();
      this._bboxExcess = 0;
      this._recoveryAttemptCount = 0;
      this._setReassembleButtonVisible(false);
    }
  }

  _easeInOutCubic(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  _updateStruggleDetection() {
    if (this.camera && typeof this.camera.isPageScrolling === 'function' && this.camera.isPageScrolling()) {
      return;
    }

    const metrics = this._computeBoundingBoxMetrics();
    this._bboxExcess = metrics.excess;
    const explodedForShow = this.explodeAmount >= this._reassembleExplodeShowThreshold;
    const explodedForHide = this.explodeAmount >= this._reassembleExplodeHideThreshold;

    if (metrics.excess <= this._bboxSolvedThreshold) {
      this._recoveryAttemptCount = 0;
    }

    const moving = this._isAnyPieceMoving();
    if (moving) {
      this._settledStillTime = 0;
    } else {
      this._settledStillTime = Math.min(
        this._settleDelaySec + 1,
        this._settledStillTime + Math.max(0, this._deltaTime)
      );
    }

    const canShow = (
      !this._reassembleState &&
      this.draggingPiece < 0 &&
      (metrics.excess >= this._bboxExcessThreshold || explodedForShow) &&
      this._settledStillTime >= this._settleDelaySec
    );

    if (!this._reassembleButtonVisible) {
      if (canShow) {
        this._setReassembleButtonVisible(true);
      }
      return;
    }

    const minVisibleElapsed = this._timeSec - this._reassembleVisibleSinceSec;
    if (minVisibleElapsed < this._reassembleMinVisibleSec) {
      return;
    }

    const shouldHide = (
      this._reassembleState ||
      this.draggingPiece >= 0 ||
      moving ||
      (metrics.excess < this._reassembleHideExcessThreshold && !explodedForHide)
    );

    if (!shouldHide) {
      this._reassembleHideCandidateSinceSec = 0;
      return;
    }

    if (this._reassembleHideCandidateSinceSec === 0) {
      this._reassembleHideCandidateSinceSec = this._timeSec;
      return;
    }

    if ((this._timeSec - this._reassembleHideCandidateSinceSec) >= this._reassembleHideDelaySec) {
      this._setReassembleButtonVisible(false);
    }
  }

  _isAnyPieceMoving() {
    if (this.draggingPiece >= 0) return true;
    if (this._reassembleState) return true;

    let maxDelta = 0;
    for (let i = 0; i < this._pieceOffsets.length; i++) {
      const current = this._pieceOffsets[i];
      const prev = this._lastMotionOffsets[i];
      const dx = current[0] - prev[0];
      const dy = current[1] - prev[1];
      const dz = current[2] - prev[2];
      const delta = Math.hypot(dx, dy, dz);

      prev[0] = current[0];
      prev[1] = current[1];
      prev[2] = current[2];

      if (delta > maxDelta) {
        maxDelta = delta;
      }
    }

    return maxDelta > this._movingFrameThreshold;
  }

  _recordRecoveryAttempt(dragDistancePx) {
    if (!Number.isFinite(dragDistancePx) || dragDistancePx < 10) return;
    if (this._reassembleState) return;

    const metrics = this._computeBoundingBoxMetrics();
    this._bboxExcess = metrics.excess;

    if (metrics.excess > this._bboxExcessThreshold) {
      this._recoveryAttemptCount += 1;
    } else if (metrics.excess <= this._bboxSolvedThreshold) {
      this._recoveryAttemptCount = 0;
    }

    this._updateStruggleDetection();
  }

  _setReassembleButtonVisible(visible) {
    const nextVisible = !!visible;
    if (this._reassembleButtonVisible === nextVisible) return;
    this._reassembleButtonVisible = nextVisible;
    if (nextVisible) {
      this._reassembleVisibleSinceSec = this._timeSec;
      this._reassembleHideCandidateSinceSec = 0;
    } else {
      this._reassembleHideCandidateSinceSec = 0;
    }

    if (!this._reassembleButton) return;
    this._reassembleButton.hidden = !nextVisible;
  }

  _syncExplodeSlider() {
    if (!this._explodeSlider) return;
    const clamped = Math.max(0, Math.min(2, this.explodeAmount));
    const sliderValue = Math.round(clamped * 50);
    if (String(sliderValue) !== this._explodeSlider.value) {
      this._explodeSlider.value = String(sliderValue);
    }
  }

  _computeBoundingBoxMetrics() {
    const solution = SOLUTIONS[this.currentSolution];
    const currentPieces = this._getRenderPieces(solution);
    const tightestPieces = this._getRenderPieces(solution, () => ZERO_OFFSET);

    const currentBox = this._computePiecesBoundingBox(currentPieces);
    const tightBox = this._computePiecesBoundingBox(tightestPieces);

    const safeTightVolume = Math.max(1e-6, tightBox.volume);
    const excess = Math.max(0, (currentBox.volume - safeTightVolume) / safeTightVolume);

    return {
      excess,
      currentVolume: currentBox.volume,
      tightVolume: tightBox.volume,
    };
  }

  _computePiecesBoundingBox(renderPieces) {
    const half = this._cubeSize * 0.5;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (const piece of renderPieces) {
      for (const cube of piece.cubes) {
        minX = Math.min(minX, cube[0] - half);
        minY = Math.min(minY, cube[1] - half);
        minZ = Math.min(minZ, cube[2] - half);
        maxX = Math.max(maxX, cube[0] + half);
        maxY = Math.max(maxY, cube[1] + half);
        maxZ = Math.max(maxZ, cube[2] + half);
      }
    }

    if (!Number.isFinite(minX)) {
      return { volume: 0 };
    }

    return {
      volume: Math.max(0, maxX - minX) * Math.max(0, maxY - minY) * Math.max(0, maxZ - minZ),
    };
  }

  _integratePieceMotion(stepDt) {
    const damping = Math.exp(-this._linearDamping * stepDt);

    for (let pieceIndex = 0; pieceIndex < this._pieceOffsets.length; pieceIndex++) {
      if (pieceIndex === this.draggingPiece) continue;

      const offset = this._pieceOffsets[pieceIndex];
      const velocity = this._pieceVelocities[pieceIndex];

      velocity[0] += -offset[0] * this._springStrength * stepDt;
      velocity[1] += (-offset[1] * this._springStrength - this._gravityStrength) * stepDt;
      velocity[2] += -offset[2] * this._springStrength * stepDt;

      velocity[0] *= damping;
      velocity[1] *= damping;
      velocity[2] *= damping;

      offset[0] += velocity[0] * stepDt;
      offset[1] += velocity[1] * stepDt;
      offset[2] += velocity[2] * stepDt;
    }

    if (this.draggingPiece >= 0) {
      const dragDecay = Math.exp(-18 * stepDt);
      this._dragVelocity[0] *= dragDecay;
      this._dragVelocity[1] *= dragDecay;
      this._dragVelocity[2] *= dragDecay;

      const dragPieceVelocity = this._pieceVelocities[this.draggingPiece];
      dragPieceVelocity[0] = this._dragVelocity[0];
      dragPieceVelocity[1] = this._dragVelocity[1];
      dragPieceVelocity[2] = this._dragVelocity[2];
    }
  }

  _solvePieceCollisions(stepDt) {
    const piecesByIndex = this._buildPiecesByIndex();

    if (this.draggingPiece >= 0) {
      this._applyDragInteractions(piecesByIndex, stepDt);
    }

    this._resolveDynamicPieceCollisions(this._buildPiecesByIndex());
  }

  _buildPiecesByIndex() {
    const renderPieces = this._getRenderPieces(SOLUTIONS[this.currentSolution]);
    const piecesByIndex = new Array(PIECES.length);
    for (const piece of renderPieces) {
      piecesByIndex[piece.pieceIndex] = piece;
    }
    return piecesByIndex;
  }

  _applyDragInteractions(piecesByIndex, stepDt) {
    const dragged = piecesByIndex[this.draggingPiece];
    if (!dragged) return;

    const dragSpeed = Math.hypot(
      this._dragVelocity[0],
      this._dragVelocity[1],
      this._dragVelocity[2]
    );
    if (dragSpeed < 0.01) return;

    for (let pieceIndex = 0; pieceIndex < piecesByIndex.length; pieceIndex++) {
      if (pieceIndex === this.draggingPiece) continue;

      const other = piecesByIndex[pieceIndex];
      if (!other) continue;

      const contact = this._getPieceContact(dragged, other);
      if (!contact) continue;

      const normal = contact.normal;
      const offset = this._pieceOffsets[pieceIndex];
      const velocity = this._pieceVelocities[pieceIndex];
      const relativeApproach = Math.max(
        0,
        this._dot(this._dragVelocity, normal) - this._dot(velocity, normal)
      );

      const impulse = this._collisionImpulse +
        relativeApproach * this._collisionVelocityScale +
        contact.penetration * 0.5;

      velocity[0] += normal[0] * impulse;
      velocity[1] += normal[1] * impulse;
      velocity[2] += normal[2] * impulse;

      const correction = Math.max(0, contact.penetration + this._touchEpsilon * 0.5) * this._collisionPush;
      offset[0] += normal[0] * correction;
      offset[1] += normal[1] * correction;
      offset[2] += normal[2] * correction;

      // Small tangential carryover makes glancing contacts feel less binary.
      const tangentX = this._dragVelocity[0] - normal[0] * this._dot(this._dragVelocity, normal);
      const tangentY = this._dragVelocity[1] - normal[1] * this._dot(this._dragVelocity, normal);
      const tangentZ = this._dragVelocity[2] - normal[2] * this._dot(this._dragVelocity, normal);
      velocity[0] += tangentX * 0.04 * stepDt;
      velocity[1] += tangentY * 0.04 * stepDt;
      velocity[2] += tangentZ * 0.04 * stepDt;
    }
  }

  _resolveDynamicPieceCollisions(piecesByIndex) {
    for (let i = 0; i < piecesByIndex.length; i++) {
      if (i === this.draggingPiece || !piecesByIndex[i]) continue;

      for (let j = i + 1; j < piecesByIndex.length; j++) {
        if (j === this.draggingPiece || !piecesByIndex[j]) continue;

        const contact = this._getPieceContact(piecesByIndex[i], piecesByIndex[j]);
        if (!contact) continue;

        const normal = contact.normal;
        const penetration = contact.penetration;
        const offsetA = this._pieceOffsets[i];
        const offsetB = this._pieceOffsets[j];

        if (penetration > 0) {
          const correction = penetration * 0.5;
          offsetA[0] -= normal[0] * correction;
          offsetA[1] -= normal[1] * correction;
          offsetA[2] -= normal[2] * correction;
          offsetB[0] += normal[0] * correction;
          offsetB[1] += normal[1] * correction;
          offsetB[2] += normal[2] * correction;
        }

        const velA = this._pieceVelocities[i];
        const velB = this._pieceVelocities[j];
        const relativeNormalVelocity = (
          (velB[0] - velA[0]) * normal[0] +
          (velB[1] - velA[1]) * normal[1] +
          (velB[2] - velA[2]) * normal[2]
        );

        if (relativeNormalVelocity < 0) {
          const impulse = -(1 + this._pairRestitution) * relativeNormalVelocity * 0.5;
          velA[0] -= normal[0] * impulse;
          velA[1] -= normal[1] * impulse;
          velA[2] -= normal[2] * impulse;
          velB[0] += normal[0] * impulse;
          velB[1] += normal[1] * impulse;
          velB[2] += normal[2] * impulse;
        }
      }
    }
  }

  _getPieceContact(pieceA, pieceB) {
    let normalX = 0;
    let normalY = 0;
    let normalZ = 0;
    let maxPenetration = 0;
    let contactCount = 0;

    for (const cubeA of pieceA.cubes) {
      for (const cubeB of pieceB.cubes) {
        const contact = this._getCubeContact(cubeA, cubeB);
        if (!contact) continue;

        const weight = Math.max(0.005, contact.penetration + this._touchEpsilon);
        normalX += contact.normal[0] * weight;
        normalY += contact.normal[1] * weight;
        normalZ += contact.normal[2] * weight;
        maxPenetration = Math.max(maxPenetration, contact.penetration);
        contactCount++;
      }
    }

    if (contactCount === 0) return null;

    const length = Math.hypot(normalX, normalY, normalZ);
    if (length < 0.00001) return null;

    return {
      normal: [normalX / length, normalY / length, normalZ / length],
      penetration: maxPenetration,
      contacts: contactCount,
    };
  }

  _getCubeContact(cubeA, cubeB) {
    const dx = cubeB[0] - cubeA[0];
    const dy = cubeB[1] - cubeA[1];
    const dz = cubeB[2] - cubeA[2];

    const overlapX = this._cubeSize - Math.abs(dx);
    const overlapY = this._cubeSize - Math.abs(dy);
    const overlapZ = this._cubeSize - Math.abs(dz);
    const eps = this._touchEpsilon;

    if (overlapX < -eps || overlapY < -eps || overlapZ < -eps) {
      return null;
    }

    let axis = 0;
    let minOverlap = overlapX;
    if (overlapY < minOverlap) {
      minOverlap = overlapY;
      axis = 1;
    }
    if (overlapZ < minOverlap) {
      minOverlap = overlapZ;
      axis = 2;
    }

    const normal = [0, 0, 0];
    if (axis === 0) {
      normal[0] = dx >= 0 ? 1 : -1;
    } else if (axis === 1) {
      normal[1] = dy >= 0 ? 1 : -1;
    } else {
      normal[2] = dz >= 0 ? 1 : -1;
    }

    return {
      normal,
      penetration: Math.max(0, minOverlap),
    };
  }

  _dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  _trimTinyMotion() {
    for (let pieceIndex = 0; pieceIndex < this._pieceOffsets.length; pieceIndex++) {
      if (pieceIndex === this.draggingPiece) continue;

      const offset = this._pieceOffsets[pieceIndex];
      const velocity = this._pieceVelocities[pieceIndex];

      const offsetSmall = (
        Math.abs(offset[0]) < 0.0005 &&
        Math.abs(offset[1]) < 0.0005 &&
        Math.abs(offset[2]) < 0.0005
      );
      const velocitySmall = (
        Math.abs(velocity[0]) < 0.004 &&
        Math.abs(velocity[1]) < 0.004 &&
        Math.abs(velocity[2]) < 0.004
      );

      if (offsetSmall && velocitySmall) {
        offset[0] = 0;
        offset[1] = 0;
        offset[2] = 0;
        velocity[0] = 0;
        velocity[1] = 0;
        velocity[2] = 0;
      }
    }
  }

  _bindInteractionEvents() {
    this._onMouseDown = (e) => {
      if (e.button !== 0) return;
      this._beginHold('mouse', 0, e.clientX, e.clientY);
    };

    this._onMouseMove = (e) => {
      this._updateHold('mouse', 0, e.clientX, e.clientY, e);
    };

    this._onMouseUp = () => {
      this._endHold('mouse', 0);
    };

    this._onTouchStart = (e) => {
      if (e.touches.length !== 1) {
        this._cancelHold(true);
        return;
      }
      const touch = e.touches[0];
      this._beginHold('touch', touch.identifier, touch.clientX, touch.clientY);
    };

    this._onTouchMove = (e) => {
      const state = this._pressState;
      if (!state || state.kind !== 'touch') return;

      if (e.touches.length !== 1) {
        this._cancelHold(true);
        return;
      }

      let touch = null;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === state.id) {
          touch = e.touches[i];
          break;
        }
      }
      if (!touch) return;

      this._updateHold('touch', state.id, touch.clientX, touch.clientY, e);
    };

    this._onTouchEnd = (e) => {
      const state = this._pressState;
      if (!state || state.kind !== 'touch') return;

      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === state.id) return;
      }
      this._endHold('touch', state.id);
    };

    this._onTouchCancel = () => {
      this._cancelHold(true);
    };

    this._onWindowBlur = () => {
      this._cancelHold(true);
    };

    this.canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove, { passive: false });
    window.addEventListener('mouseup', this._onMouseUp);

    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: true });
    this.canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this._onTouchEnd, { passive: true });
    this.canvas.addEventListener('touchcancel', this._onTouchCancel, { passive: true });
    window.addEventListener('blur', this._onWindowBlur);
  }

  _beginHold(kind, id, clientX, clientY) {
    if (this._reassembleState) return;
    this._cancelHold(false);

    const pieceIndex = this._pickPieceAt(clientX, clientY);
    if (pieceIndex < 0) return;

    const state = {
      kind,
      id,
      pieceIndex,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      dragDistancePx: 0,
      active: false,
      timerId: 0,
    };

    state.timerId = window.setTimeout(() => {
      if (this._pressState !== state) return;

      const moveDist = Math.hypot(state.lastX - state.startX, state.lastY - state.startY);
      if (moveDist > this.holdMoveThresholdPx) return;

      state.active = true;
      this.draggingPiece = state.pieceIndex;
      this.highlightedPiece = state.pieceIndex;
      this._dragVelocity[0] = 0;
      this._dragVelocity[1] = 0;
      this._dragVelocity[2] = 0;
      this._lastDragMoveSec = performance.now() / 1000;

      const pieceVelocity = this._pieceVelocities[state.pieceIndex];
      pieceVelocity[0] = 0;
      pieceVelocity[1] = 0;
      pieceVelocity[2] = 0;

      this.camera.setInputLocked(true);
    }, this.holdThresholdMs);

    this._pressState = state;
  }

  _updateHold(kind, id, clientX, clientY, event) {
    const state = this._pressState;
    if (!state) return;
    if (state.kind !== kind || state.id !== id) return;

    if (!state.active) {
      state.lastX = clientX;
      state.lastY = clientY;

      const moveDist = Math.hypot(clientX - state.startX, clientY - state.startY);
      if (moveDist > this.holdMoveThresholdPx) {
        this._cancelHold(false);
      }
      return;
    }

    event.preventDefault();

    const dx = clientX - state.lastX;
    const dy = clientY - state.lastY;
    state.lastX = clientX;
    state.lastY = clientY;
    state.dragDistancePx += Math.hypot(dx, dy);

    this._applyDragDelta(state.pieceIndex, dx, dy, event.timeStamp * 0.001);
  }

  _endHold(kind, id) {
    const state = this._pressState;
    if (!state) return;
    if (state.kind !== kind || state.id !== id) return;

    const wasActive = state.active;
    const pieceIndex = state.pieceIndex;
    const dragDistancePx = state.dragDistancePx || 0;
    window.clearTimeout(state.timerId);
    this._pressState = null;

    this.draggingPiece = -1;
    this.highlightedPiece = -1;
    this._dragVelocity[0] = 0;
    this._dragVelocity[1] = 0;
    this._dragVelocity[2] = 0;
    this._lastDragMoveSec = 0;

    if (wasActive) {
      const pieceVelocity = this._pieceVelocities[pieceIndex];
      pieceVelocity[0] = 0;
      pieceVelocity[1] = 0;
      pieceVelocity[2] = 0;
      this._recordRecoveryAttempt(dragDistancePx);
      this.camera.setInputLocked(false);
    }
  }

  _cancelHold(unlockCamera) {
    if (!this._pressState) {
      if (unlockCamera) this.camera.setInputLocked(false);
      return;
    }

    const wasActive = this._pressState.active;
    const pieceIndex = this._pressState.pieceIndex;
    window.clearTimeout(this._pressState.timerId);
    this._pressState = null;

    this.draggingPiece = -1;
    this.highlightedPiece = -1;
    this._dragVelocity[0] = 0;
    this._dragVelocity[1] = 0;
    this._dragVelocity[2] = 0;
    this._lastDragMoveSec = 0;

    if (wasActive && Number.isInteger(pieceIndex) && this._pieceVelocities[pieceIndex]) {
      const pieceVelocity = this._pieceVelocities[pieceIndex];
      pieceVelocity[0] = 0;
      pieceVelocity[1] = 0;
      pieceVelocity[2] = 0;
    }

    if (unlockCamera || wasActive) {
      this.camera.setInputLocked(false);
    }
  }

  _pickPieceAt(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    if (
      localX < 0 || localX > rect.width ||
      localY < 0 || localY > rect.height
    ) {
      return -1;
    }

    const ray = this._buildPickRay(localX, localY, rect.width, rect.height);
    if (!ray) return -1;

    const renderPieces = this._getRenderPieces(SOLUTIONS[this.currentSolution]);
    let bestPiece = -1;
    let bestT = Infinity;

    for (const piece of renderPieces) {
      for (const cube of piece.cubes) {
        const t = this._rayIntersectCube(
          ray.origin,
          ray.direction,
          cube,
          this._cubeSize * 0.5 + 0.015
        );
        if (t !== null && t < bestT) {
          bestT = t;
          bestPiece = piece.pieceIndex;
        }
      }
    }

    return bestPiece;
  }

  _buildPickRay(localX, localY, width, height) {
    if (width <= 0 || height <= 0) return null;

    const ndcX = (localX / width) * 2 - 1;
    const ndcY = 1 - (localY / height) * 2;
    const aspect = width / height;
    const tanHalfFov = Math.tan(this._fovY * 0.5);

    const eye = this.camera.getEyePosition();
    const target = this.camera.target || Vec3.create(0, 0, 0);

    const forward = Vec3.create(
      target[0] - eye[0],
      target[1] - eye[1],
      target[2] - eye[2]
    );
    Vec3.normalize(forward, forward);

    const worldUp = Vec3.create(0, 1, 0);
    const right = Vec3.create();
    Vec3.cross(right, forward, worldUp);
    if (Vec3.length(right) < 0.0001) {
      right[0] = 1;
      right[1] = 0;
      right[2] = 0;
    } else {
      Vec3.normalize(right, right);
    }

    const up = Vec3.create();
    Vec3.cross(up, right, forward);
    Vec3.normalize(up, up);

    const sx = ndcX * aspect * tanHalfFov;
    const sy = ndcY * tanHalfFov;

    const direction = Vec3.create(
      forward[0] + right[0] * sx + up[0] * sy,
      forward[1] + right[1] * sx + up[1] * sy,
      forward[2] + right[2] * sx + up[2] * sy
    );
    Vec3.normalize(direction, direction);

    return { origin: eye, direction };
  }

  _rayIntersectCube(rayOrigin, rayDir, cubeCenter, halfSize) {
    const minX = cubeCenter[0] - halfSize;
    const minY = cubeCenter[1] - halfSize;
    const minZ = cubeCenter[2] - halfSize;
    const maxX = cubeCenter[0] + halfSize;
    const maxY = cubeCenter[1] + halfSize;
    const maxZ = cubeCenter[2] + halfSize;

    let tMin = -Infinity;
    let tMax = Infinity;

    const axes = [
      [rayOrigin[0], rayDir[0], minX, maxX],
      [rayOrigin[1], rayDir[1], minY, maxY],
      [rayOrigin[2], rayDir[2], minZ, maxZ],
    ];

    for (const [origin, dir, min, max] of axes) {
      if (Math.abs(dir) < 1e-8) {
        if (origin < min || origin > max) return null;
        continue;
      }

      const inv = 1 / dir;
      const t1 = (min - origin) * inv;
      const t2 = (max - origin) * inv;
      const near = Math.min(t1, t2);
      const far = Math.max(t1, t2);

      tMin = Math.max(tMin, near);
      tMax = Math.min(tMax, far);

      if (tMin > tMax) return null;
    }

    if (tMax < 0 || tMin > tMax) {
      return null;
    }

    return tMin >= 0 ? tMin : tMax;
  }

  _applyDragDelta(pieceIndex, dxPixels, dyPixels, eventTimeSec) {
    const offset = this._pieceOffsets[pieceIndex];
    if (!offset) return;

    const renderPieces = this._getRenderPieces(SOLUTIONS[this.currentSolution]);
    const piece = renderPieces.find((p) => p.pieceIndex === pieceIndex);
    if (!piece) return;

    const eye = this.camera.getEyePosition();
    const target = this.camera.target || Vec3.create(0, 0, 0);

    const forward = Vec3.create(target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]);
    Vec3.normalize(forward, forward);

    const worldUp = Vec3.create(0, 1, 0);
    const right = Vec3.create();
    Vec3.cross(right, forward, worldUp);
    if (Vec3.length(right) < 0.0001) {
      right[0] = 1;
      right[1] = 0;
      right[2] = 0;
    } else {
      Vec3.normalize(right, right);
    }

    const up = Vec3.create();
    Vec3.cross(up, right, forward);
    Vec3.normalize(up, up);

    const toPiece = Vec3.create(
      piece.center[0] - eye[0],
      piece.center[1] - eye[1],
      piece.center[2] - eye[2]
    );
    const depth = Math.max(0.7, Vec3.dot(toPiece, forward));
    const worldPerPixel = (
      2 * Math.tan(this._fovY * 0.5) * depth
    ) / Math.max(1, this.canvas.clientHeight);

    const prevX = offset[0];
    const prevY = offset[1];
    const prevZ = offset[2];

    offset[0] += right[0] * dxPixels * worldPerPixel + up[0] * (-dyPixels) * worldPerPixel;
    offset[1] += right[1] * dxPixels * worldPerPixel + up[1] * (-dyPixels) * worldPerPixel;
    offset[2] += right[2] * dxPixels * worldPerPixel + up[2] * (-dyPixels) * worldPerPixel;

    const magnitude = Math.sqrt(offset[0] * offset[0] + offset[1] * offset[1] + offset[2] * offset[2]);
    if (magnitude > this._maxDragOffset) {
      const scale = this._maxDragOffset / magnitude;
      offset[0] *= scale;
      offset[1] *= scale;
      offset[2] *= scale;
    }

    const nowSec = Number.isFinite(eventTimeSec) ? eventTimeSec : (performance.now() / 1000);
    const dt = this._lastDragMoveSec > 0
      ? Math.max(1 / 240, Math.min(1 / 20, nowSec - this._lastDragMoveSec))
      : 1 / 60;
    this._lastDragMoveSec = nowSec;

    this._dragVelocity[0] = (offset[0] - prevX) / dt;
    this._dragVelocity[1] = (offset[1] - prevY) / dt;
    this._dragVelocity[2] = (offset[2] - prevZ) / dt;

    const pieceVelocity = this._pieceVelocities[pieceIndex];
    pieceVelocity[0] = this._dragVelocity[0];
    pieceVelocity[1] = this._dragVelocity[1];
    pieceVelocity[2] = this._dragVelocity[2];
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
  const introRenderer = setupVisualization('intro-canvas', IntroRenderer, {
    useWoodColors: true,
    useWoodGrain: true,
    enablePinchExplode: true,
    distance: 7,
    rotationX: 0.35,
    rotationY: 0.6
  });
  if (introRenderer) {
    const explodeSlider = document.getElementById('intro-explode');
    const reassembleBtn = document.getElementById('intro-reassemble');
    if (explodeSlider) {
      introRenderer.setExplodeSlider(explodeSlider);
      explodeSlider.addEventListener('input', (e) => {
        introRenderer.setExplode(parseInt(e.target.value) / 50); // 0-100 -> 0-2
      });
    }
    if (reassembleBtn) {
      introRenderer.setReassembleButton(reassembleBtn);
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
