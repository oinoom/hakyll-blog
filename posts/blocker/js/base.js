/**
 * base.js - Shared utilities for interactive visualizations
 *
 * Provides:
 * - Vector/matrix math
 * - WebGL helpers
 * - Orbit camera controls
 * - Animation loop management
 */

// ============================================================
// VECTOR MATH
// ============================================================

const Vec3 = {
  create(x = 0, y = 0, z = 0) {
    return new Float32Array([x, y, z]);
  },

  add(out, a, b) {
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    out[2] = a[2] + b[2];
    return out;
  },

  sub(out, a, b) {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
    return out;
  },

  scale(out, a, s) {
    out[0] = a[0] * s;
    out[1] = a[1] * s;
    out[2] = a[2] * s;
    return out;
  },

  normalize(out, a) {
    const len = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
    if (len > 0) {
      out[0] = a[0] / len;
      out[1] = a[1] / len;
      out[2] = a[2] / len;
    }
    return out;
  },

  cross(out, a, b) {
    const ax = a[0], ay = a[1], az = a[2];
    const bx = b[0], by = b[1], bz = b[2];
    out[0] = ay * bz - az * by;
    out[1] = az * bx - ax * bz;
    out[2] = ax * by - ay * bx;
    return out;
  },

  dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  },

  length(a) {
    return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  }
};

// ============================================================
// MATRIX MATH (4x4, column-major for WebGL)
// ============================================================

const Mat4 = {
  create() {
    const out = new Float32Array(16);
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
  },

  identity(out) {
    out.fill(0);
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
  },

  multiply(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    return out;
  },

  perspective(out, fovY, aspect, near, far) {
    const f = 1.0 / Math.tan(fovY / 2);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  },

  lookAt(out, eye, center, up) {
    const zAxis = Vec3.create();
    const xAxis = Vec3.create();
    const yAxis = Vec3.create();

    Vec3.sub(zAxis, eye, center);
    Vec3.normalize(zAxis, zAxis);
    Vec3.cross(xAxis, up, zAxis);
    Vec3.normalize(xAxis, xAxis);
    Vec3.cross(yAxis, zAxis, xAxis);

    out[0] = xAxis[0]; out[1] = yAxis[0]; out[2] = zAxis[0]; out[3] = 0;
    out[4] = xAxis[1]; out[5] = yAxis[1]; out[6] = zAxis[1]; out[7] = 0;
    out[8] = xAxis[2]; out[9] = yAxis[2]; out[10] = zAxis[2]; out[11] = 0;
    out[12] = -Vec3.dot(xAxis, eye);
    out[13] = -Vec3.dot(yAxis, eye);
    out[14] = -Vec3.dot(zAxis, eye);
    out[15] = 1;
    return out;
  },

  translate(out, a, v) {
    const x = v[0], y = v[1], z = v[2];
    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    if (out !== a) {
      for (let i = 0; i < 12; i++) out[i] = a[i];
    }
    return out;
  },

  rotateX(out, a, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    if (out !== a) {
      out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
      out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    out[4] = a10 * c + a20 * s;
    out[5] = a11 * c + a21 * s;
    out[6] = a12 * c + a22 * s;
    out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s;
    out[9] = a21 * c - a11 * s;
    out[10] = a22 * c - a12 * s;
    out[11] = a23 * c - a13 * s;
    return out;
  },

  rotateY(out, a, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    if (out !== a) {
      out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
      out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    out[0] = a00 * c - a20 * s;
    out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s;
    out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c;
    out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c;
    out[11] = a03 * s + a23 * c;
    return out;
  }
};

// ============================================================
// WEBGL HELPERS
// ============================================================

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

function resizeCanvasToDisplaySize(canvas) {
  // Cap DPR at 2 for performance on high-density displays
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const displayWidth = Math.floor(canvas.clientWidth * dpr);
  const displayHeight = Math.floor(canvas.clientHeight * dpr);

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    return true;
  }
  return false;
}

// ============================================================
// ORBIT CAMERA
// ============================================================

class OrbitCamera {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.distance = options.distance || 8;
    this.minDistance = options.minDistance || 2;
    this.maxDistance = options.maxDistance || 20;
    this.rotationX = options.rotationX || 0.5; // radians
    this.rotationY = options.rotationY || 0.5;
    this.target = options.target || Vec3.create(0, 0, 0);

    // Scroll callback (for explode or other effects)
    this.onScroll = options.onScroll || null;
    this._captureWheel = options.captureWheel || false;

    // Scroll orbit options
    this._scrollOrbit = options.scrollOrbit || false;
    this._scrollOrbitAmount = options.scrollOrbitAmount || 0.3;

    this._isDragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._inputLocked = false;

    this._bindEvents();
  }

  _bindEvents() {
    const canvas = this.canvas;

    // Mouse events
    canvas.addEventListener('mousedown', (e) => {
      if (this._inputLocked) return;
      this._isDragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (this._inputLocked) return;
      if (!this._isDragging) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;

      this.rotationY += dx * 0.01;
      this.rotationX += dy * 0.01;
      this.rotationX = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.rotationX));
    });

    window.addEventListener('mouseup', () => {
      if (this._inputLocked) return;
      if (this._isDragging && this._scrollOrbit) {
        // Update base rotation so scroll orbit continues from current position
        this._updateBaseRotation();
      }
      this._isDragging = false;
    });

    // Touch events - only capture if page is not actively scrolling
    this._pinchDistance = 0;
    this._isPageScrolling = false;
    this._scrollTimeout = null;

    // Track page scroll state
    const markScrolling = () => {
      this._isPageScrolling = true;
      clearTimeout(this._scrollTimeout);
      this._scrollTimeout = setTimeout(() => {
        this._isPageScrolling = false;
      }, 150); // Consider scroll "stopped" after 150ms of no scroll events
    };
    window.addEventListener('scroll', markScrolling, { passive: true });

    canvas.addEventListener('touchstart', (e) => {
      if (this._inputLocked) return;
      if (e.touches.length === 1) {
        // Record start position, but don't start dragging yet
        this._touchStartX = e.touches[0].clientX;
        this._touchStartY = e.touches[0].clientY;
        this._lastX = e.touches[0].clientX;
        this._lastY = e.touches[0].clientY;
        this._isDragging = false;
        this._touchDecided = false; // Haven't decided if this is drag or scroll yet
      } else if (e.touches.length === 2) {
        this._isDragging = false;
        this._touchDecided = true;
        this._pinchDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (this._inputLocked) return;
      // Two fingers: pinch to zoom/explode
      if (e.touches.length === 2) {
        e.preventDefault();
        const newDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (this._pinchDistance === 0) {
          this._pinchDistance = newDistance;
          return;
        }
        const delta = this._pinchDistance - newDistance;
        this._pinchDistance = newDistance;

        if (this.onScroll) {
          this.onScroll(delta * 2);
        }
        return;
      }

      // Single finger: decide if this is rotation or scroll based on angle
      if (e.touches.length === 1) {
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;

        // If we haven't decided yet, check the gesture angle
        if (!this._touchDecided) {
          const dx = Math.abs(currentX - this._touchStartX);
          const dy = Math.abs(currentY - this._touchStartY);

          // Need some movement to decide
          if (dx > 5 || dy > 5) {
            // Only rotate if gesture is >30° from vertical (tan(30°) ≈ 0.577)
            const isHorizontalEnough = dx > dy * 0.577;
            this._isDragging = isHorizontalEnough;
            this._touchDecided = true;
          }
        }

        if (this._isDragging) {
          e.preventDefault();
          const dx = currentX - this._lastX;
          const dy = currentY - this._lastY;
          this._lastX = currentX;
          this._lastY = currentY;

          this.rotationY -= dx * 0.01;
          this.rotationX += dy * 0.01;
          this.rotationX = Math.max(
            -Math.PI / 2 + 0.1,
            Math.min(Math.PI / 2 - 0.1, this.rotationX)
          );
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      if (this._inputLocked) return;
      if (this._isDragging && this._scrollOrbit) {
        // Update base rotation so scroll orbit continues from current position
        this._updateBaseRotation();
      }
      this._isDragging = false;
      this._pinchDistance = 0;
    }, { passive: true });

    // Scroll event - only capture wheel if explicitly enabled (pinch still works via onScroll)
    if (this.onScroll && this._captureWheel) {
      canvas.addEventListener('wheel', (e) => {
        if (this._inputLocked) return;
        e.preventDefault();
        this.onScroll(e.deltaY);
      }, { passive: false });
    }

    // Trackpad pinch gesture (fires as wheel with ctrlKey on Mac)
    if (this.onScroll) {
      canvas.addEventListener('wheel', (e) => {
        if (this._inputLocked) return;
        if (e.ctrlKey) {
          e.preventDefault();
          this.onScroll(e.deltaY * 3);
        }
      }, { passive: false });
    }

    // Passive scroll orbit - rotates gently as user scrolls past
    if (this._scrollOrbit) {
      this._baseRotationY = this.rotationY;

      this._getScrollOffset = () => {
        const rect = canvas.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const centerY = rect.top + rect.height / 2;
        return (centerY - viewportHeight / 2) / (viewportHeight / 2);
      };

      this._updateBaseRotation = () => {
        // Recalculate base so current position is preserved
        const currentOffset = this._getScrollOffset();
        this._baseRotationY = this.rotationY - currentOffset * this._scrollOrbitAmount;
      };

      const updateScrollOrbit = () => {
        if (this._inputLocked) return;
        if (this._isDragging) return; // Don't fight with user dragging
        const normalizedPos = this._getScrollOffset();
        this.rotationY = this._baseRotationY + normalizedPos * this._scrollOrbitAmount;
      };

      window.addEventListener('scroll', updateScrollOrbit, { passive: true });
      updateScrollOrbit(); // Initial update
    }
  }

  setInputLocked(locked) {
    this._inputLocked = !!locked;
    if (this._inputLocked) {
      this._isDragging = false;
      this._pinchDistance = 0;
      this._touchDecided = true;
    }
  }

  isPageScrolling() {
    return !!this._isPageScrolling;
  }

  setDistance(d) {
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, d));
  }

  getViewMatrix() {
    const eye = Vec3.create(
      this.target[0] + this.distance * Math.cos(this.rotationX) * Math.sin(this.rotationY),
      this.target[1] + this.distance * Math.sin(this.rotationX),
      this.target[2] + this.distance * Math.cos(this.rotationX) * Math.cos(this.rotationY)
    );
    const up = Vec3.create(0, 1, 0);
    return Mat4.lookAt(Mat4.create(), eye, this.target, up);
  }

  getEyePosition() {
    return Vec3.create(
      this.target[0] + this.distance * Math.cos(this.rotationX) * Math.sin(this.rotationY),
      this.target[1] + this.distance * Math.sin(this.rotationX),
      this.target[2] + this.distance * Math.cos(this.rotationX) * Math.cos(this.rotationY)
    );
  }
}

// ============================================================
// ANIMATION LOOP
// ============================================================

class AnimationLoop {
  constructor(callback) {
    this.callback = callback;
    this.running = false;
    this._frame = null;
    this._lastTime = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = performance.now();
    this._loop();
  }

  stop() {
    this.running = false;
    if (this._frame) {
      cancelAnimationFrame(this._frame);
      this._frame = null;
    }
  }

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    const dt = (now - this._lastTime) / 1000;
    this._lastTime = now;

    this.callback(dt, now / 1000);

    this._frame = requestAnimationFrame(() => this._loop());
  }
}

// Export for use in other scripts
window.Vec3 = Vec3;
window.Mat4 = Mat4;
window.createProgram = createProgram;
window.resizeCanvasToDisplaySize = resizeCanvasToDisplaySize;
window.OrbitCamera = OrbitCamera;
window.AnimationLoop = AnimationLoop;
