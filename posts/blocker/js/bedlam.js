/**
 * bedlam.js - Bedlam cube (4x4x4) visualization
 *
 * Adapted from blocker.js for the 4x4x4 Bedlam cube with 13 pieces.
 * Reuses base.js for WebGL utilities, orbit camera, and animation loop.
 */
(function() {

// ============================================================
// PIECE DATA
// ============================================================

// The 13 Bedlam cube pieces (same as Rust BEDLAM_PIECES constant)
const BEDLAM_PIECES = [
  [[0,0,0], [0,1,0], [1,0,0], [0,0,1]],                         // 0: Little Corner (4)
  [[0,0,0], [1,0,0], [2,0,0], [3,0,0], [3,1,0]],                // 1: Long Stick (5)
  [[0,0,0], [0,1,0], [1,1,0], [1,2,0], [2,2,0]],                // 2: Hat (5)
  [[0,0,0], [0,1,0], [1,1,0], [1,2,0], [1,1,1]],                // 3: Bucket (5)
  [[0,0,0], [1,0,0], [1,0,1], [1,1,1], [2,1,1]],                // 4: Screw (5)
  [[0,0,0], [1,0,0], [1,1,0], [1,1,1], [2,1,1]],                // 5: Twist (5)
  [[0,0,0], [1,0,0], [2,0,0], [1,1,0], [1,0,1]],                // 6: Signpost (5)
  [[0,0,0], [1,0,0], [1,1,0], [2,1,0], [1,0,1]],                // 7: Ducktail (5)
  [[0,0,0], [0,1,0], [1,1,0], [2,1,0], [1,2,0]],                // 8: Plane (5)
  [[0,0,0], [1,0,0], [2,0,0], [0,1,0], [2,1,0]],                // 9: Bridge (5)
  [[0,0,0], [1,0,0], [1,1,0], [2,1,0], [2,2,0]],                // 10: Staircase (5)
  [[0,0,1], [0,1,0], [0,1,1], [1,1,0], [1,2,0]],                // 11: Spikey Zag (5)
  [[0,0,0], [0,1,0], [0,1,1], [1,1,0], [1,2,0]],                // 12: Middle Zig (5)
];

// 13 distinct piece colors
const BEDLAM_COLORS = [
  [0.95, 0.30, 0.25], // 0: red
  [0.30, 0.75, 0.35], // 1: green
  [0.30, 0.45, 0.90], // 2: blue
  [0.95, 0.85, 0.25], // 3: yellow
  [0.80, 0.35, 0.75], // 4: magenta
  [0.25, 0.80, 0.80], // 5: cyan
  [0.95, 0.55, 0.20], // 6: orange
  [0.60, 0.40, 0.80], // 7: purple
  [0.45, 0.75, 0.20], // 8: lime
  [0.90, 0.45, 0.55], // 9: pink
  [0.35, 0.60, 0.50], // 10: teal
  [0.85, 0.70, 0.40], // 11: gold
  [0.50, 0.50, 0.70], // 12: slate
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
// BEDLAM RENDERER
// ============================================================

class BedlamRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { antialias: true });
    if (!this.gl) {
      console.error('WebGL not supported');
      return;
    }

    this.explodeAmount = 0;
    this.currentSolution = 0;

    // 4x4x4 grid center is at 1.5, 1.5, 1.5
    this.gridCenter = 1.5;

    this.camera = new OrbitCamera(canvas, {
      distance: options.distance || 10,
      rotationX: options.rotationX || 0.4,
      rotationY: options.rotationY || 0.8,
      minDistance: options.minDistance || 4,
      maxDistance: options.maxDistance || 20,
      scrollOrbit: true,
      scrollOrbitAmount: 0.3,
      onScroll: (deltaY) => {
        this.explodeAmount -= deltaY * 0.002;
        this.explodeAmount = Math.max(0, Math.min(3, this.explodeAmount));
      }
    });

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

  setSolution(index) {
    this.currentSolution = index;
  }

  setExplode(amount) {
    this.explodeAmount = amount;
  }

  render() {
    const gl = this.gl;
    if (!gl || !this.program) return;

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

    const solution = BEDLAM_SOLUTIONS[this.currentSolution];
    const center = this.gridCenter;

    for (const [pieceIndex, cubes] of solution) {
      const color = BEDLAM_COLORS[pieceIndex];

      // Compute piece centroid
      let cx = 0, cy = 0, cz = 0;
      for (const [x, y, z] of cubes) {
        cx += x; cy += y; cz += z;
      }
      cx /= cubes.length;
      cy /= cubes.length;
      cz /= cubes.length;

      // Explosion direction from grid center
      const dx = cx - center, dy = cy - center, dz = cz - center;
      const len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
      const ex = dx / len, ey = dy / len, ez = dz / len;

      for (const [x, y, z] of cubes) {
        const px = (x - center) + ex * this.explodeAmount;
        const py = (y - center) + ey * this.explodeAmount;
        const pz = (z - center) + ez * this.explodeAmount;

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
// ANIMATED RENDERER (cycles through solutions with staggered transitions)
// ============================================================

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

class BedlamAnimatedRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { antialias: true });
    if (!this.gl) return;

    this.gridCenter = 1.5;
    this.time = 0;

    this.numPieces = 13;
    this.pieceDuration = 0.35;
    this.staggerDelay = 0.1;
    this.explodeDistance = 2.5;

    this.holdTime = 0.6;
    this.transitionTime = 0.4;
    this.flyTime = this.staggerDelay * (this.numPieces - 1) + this.pieceDuration;
    // Per solution: hold + fly out + transition + fly in
    this.cycleTime = this.holdTime + this.flyTime + this.transitionTime + this.flyTime;

    this.camera = new OrbitCamera(canvas, {
      distance: options.distance || 10,
      rotationX: options.rotationX || 0.4,
      rotationY: options.rotationY || 0.8,
      minDistance: 4,
      maxDistance: 25,
      scrollOrbit: true,
      scrollOrbitAmount: 0.3,
    });

    this._initGL();
    this._initGeometry();
    this._precomputeAll();
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

  _precomputeAll() {
    const center = this.gridCenter;
    const dist = this.explodeDistance;

    // For each solution, build lookup by pieceIndex with assembled + exploded positions
    this.solutionData = BEDLAM_SOLUTIONS.map(solution => {
      const byPiece = {};
      for (const [pieceIndex, cubes] of solution) {
        let cx = 0, cy = 0, cz = 0;
        for (const [x, y, z] of cubes) { cx += x; cy += y; cz += z; }
        cx /= cubes.length; cy /= cubes.length; cz /= cubes.length;

        const dx = cx - center, dy = cy - center, dz = cz - center;
        const len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
        const dirX = dx / len * dist, dirY = dy / len * dist, dirZ = dz / len * dist;

        byPiece[pieceIndex] = cubes.map(([x, y, z]) => ({
          ax: x - center, ay: y - center, az: z - center,
          ex: (x - center) + dirX, ey: (y - center) + dirY, ez: (z - center) + dirZ,
        }));
      }
      return byPiece;
    });
  }

  render(dt) {
    const gl = this.gl;
    if (!gl || !this.program) return;

    this.time += dt;

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

    const totalSolutions = BEDLAM_SOLUTIONS.length;
    const solIdx = Math.floor(this.time / this.cycleTime) % totalSolutions;
    const nextIdx = (solIdx + 1) % totalSolutions;
    const phase = this.time % this.cycleTime;

    const current = this.solutionData[solIdx];
    const next = this.solutionData[nextIdx];

    const flyOutEnd = this.holdTime + this.flyTime;
    const transEnd = flyOutEnd + this.transitionTime;

    for (let pieceIndex = 0; pieceIndex < this.numPieces; pieceIndex++) {
      const color = BEDLAM_COLORS[pieceIndex];
      const curCubes = current[pieceIndex];
      const nxtCubes = next[pieceIndex];

      for (let ci = 0; ci < curCubes.length; ci++) {
        const cc = curCubes[ci];
        const nc = nxtCubes[ci];
        let px, py, pz;

        if (phase < this.holdTime) {
          // Assembled, current solution
          px = cc.ax; py = cc.ay; pz = cc.az;

        } else if (phase < flyOutEnd) {
          // Staggered fly out from current solution
          const flyOutStart = this.holdTime + pieceIndex * this.staggerDelay;
          let t;
          if (phase < flyOutStart) {
            t = 0;
          } else if (phase < flyOutStart + this.pieceDuration) {
            t = easeInOut((phase - flyOutStart) / this.pieceDuration);
          } else {
            t = 1;
          }
          px = cc.ax + (cc.ex - cc.ax) * t;
          py = cc.ay + (cc.ey - cc.ay) * t;
          pz = cc.az + (cc.ez - cc.az) * t;

        } else if (phase < transEnd) {
          // Smooth transition between exploded positions
          const tp = easeInOut((phase - flyOutEnd) / this.transitionTime);
          px = cc.ex + (nc.ex - cc.ex) * tp;
          py = cc.ey + (nc.ey - cc.ey) * tp;
          pz = cc.ez + (nc.ez - cc.ez) * tp;

        } else {
          // Staggered fly in to next solution
          const reverseI = this.numPieces - 1 - pieceIndex;
          const flyInStart = transEnd + reverseI * this.staggerDelay;
          let t;
          if (phase < flyInStart) {
            t = 1;
          } else if (phase < flyInStart + this.pieceDuration) {
            t = 1 - easeInOut((phase - flyInStart) / this.pieceDuration);
          } else {
            t = 0;
          }
          px = nc.ax + (nc.ex - nc.ax) * t;
          py = nc.ay + (nc.ey - nc.ay) * t;
          pz = nc.az + (nc.ez - nc.az) * t;
        }

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
// INITIALIZATION
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

function setupVisualization(canvasId, RendererClass, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const container = canvas.parentElement;

  if (!isWebGLAvailable()) {
    if (container) {
      container.classList.add('webgl-unavailable');
    }
    return null;
  }

  canvas.style.width = '100%';
  canvas.style.height = '400px';

  const renderer = new RendererClass(canvas, options);
  if (!renderer || !renderer.gl) {
    if (container) {
      container.classList.add('webgl-unavailable');
    }
    return null;
  }

  const loop = new AnimationLoop((dt) => {
    renderer.render(dt);
  });
  loop.start();

  return renderer;
}

document.addEventListener('DOMContentLoaded', () => {
  // ---- Animated pieces visualization ----
  const animatedRenderer = setupVisualization('bedlam-pieces-canvas', BedlamAnimatedRenderer, {
    distance: 14,
    rotationX: 0.4,
    rotationY: 0.8
  });

  // ---- Main solution visualization ----
  const solutionRenderer = setupVisualization('bedlam-solution-canvas', BedlamRenderer, {
    distance: 10,
    rotationX: 0.4,
    rotationY: 0.8
  });

  if (solutionRenderer) {
    const prevBtn = document.getElementById('bedlam-prev-solution');
    const nextBtn = document.getElementById('bedlam-next-solution');
    const solutionLabel = document.getElementById('bedlam-solution-label');
    const explodeSlider = document.getElementById('bedlam-explode');
    let currentSolution = 0;
    const totalSolutions = BEDLAM_SOLUTIONS.length;

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

    if (explodeSlider) {
      explodeSlider.addEventListener('input', (e) => {
        solutionRenderer.setExplode(parseFloat(e.target.value) / 100 * 3);
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
})();
