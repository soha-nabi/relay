'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

// ─── Types only (no THREE import at module level to stay SSR-safe) ───────────
interface ShaderRefs {
  scene: any;
  camera: any;
  renderer: any;
  mesh: any;
  uniforms: any;
  animationId: number | null;
  observer: ResizeObserver | null;
  intersectionObserver: IntersectionObserver | null;
  isVisible: boolean;
  reducedMotion: boolean;
}

function WebGLShaderInner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const refs = useRef<ShaderRefs>({
    scene: null, camera: null, renderer: null,
    mesh: null, uniforms: null, animationId: null,
    observer: null, intersectionObserver: null,
    isVisible: true, reducedMotion: false,
  });

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const r = refs.current;

    // Respect prefers-reduced-motion
    r.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Relay brand blue palette for tinting
    const vertexShader = `
      attribute vec3 position;
      void main() { gl_Position = vec4(position, 1.0); }
    `;

    // Tinted toward Relay's brand blue (#2563eb) — subtle enough for WCAG AA text contrast
    const fragmentShader = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;
      uniform float xScale;
      uniform float yScale;
      uniform float distortion;

      void main() {
        vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);
        float d = length(p) * distortion;

        float rx = p.x * (1.0 + d);
        float gx = p.x;
        float bx = p.x * (1.0 - d);

        float r = 0.04 / abs(p.y + sin((rx + time) * xScale) * yScale);
        float g = 0.04 / abs(p.y + sin((gx + time) * xScale) * yScale);
        float b = 0.06 / abs(p.y + sin((bx + time) * xScale) * yScale);

        // Tint: push toward Relay blue (0.145, 0.388, 0.922 ≈ #2563eb)
        // mix the raw streak with a brand-blue base so text stays readable
        vec3 streak = vec3(r, g, b);
        vec3 brandBase = vec3(0.04, 0.08, 0.22);          // deep navy
        vec3 brandAccent = vec3(0.145, 0.388, 0.922);     // #2563eb

        // Dampen the streak and tint it
        streak = clamp(streak * 0.38, 0.0, 0.7);
        vec3 col = mix(brandBase, streak + brandAccent * 0.18, streak.b + streak.r * 0.4);
        col = clamp(col, 0.0, 1.0);

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const getSize = () => ({
      w: container.clientWidth || 800,
      h: container.clientHeight || 480,
    });

    const applyFallback = () => {
      canvas.style.background =
        'linear-gradient(135deg, #0f1c3f 0%, #0e2264 40%, #1a3a8a 100%)';
    };

    // Try creating WebGL renderer
    let THREE: typeof import('three');
    const initAndAnimate = async () => {
      try {
        THREE = await import('three');
      } catch {
        applyFallback();
        return;
      }

      try {
        r.scene = new THREE.Scene();
        r.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
        r.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        r.renderer.setClearColor(new THREE.Color(0x0f1c3f));
        r.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, -1);

        const { w, h } = getSize();
        r.uniforms = {
          resolution: { value: [w, h] },
          time: { value: 0.0 },
          xScale: { value: 1.0 },
          yScale: { value: 0.45 },
          distortion: { value: 0.05 },
        };

        const positions = new THREE.BufferAttribute(new Float32Array([
          -1, -1, 0,  1, -1, 0,  -1, 1, 0,
           1, -1, 0,  -1, 1, 0,   1, 1, 0,
        ]), 3);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', positions);

        const material = new THREE.RawShaderMaterial({
          vertexShader, fragmentShader,
          uniforms: r.uniforms,
          side: THREE.DoubleSide,
        });

        r.mesh = new THREE.Mesh(geometry, material);
        r.scene.add(r.mesh);

        const { w: iw, h: ih } = getSize();
        r.renderer.setSize(iw, ih, false);
        r.uniforms.resolution.value = [iw, ih];

        // Render one static frame first (respects reduced-motion)
        r.renderer.render(r.scene, r.camera);

        if (!r.reducedMotion) {
          const loop = () => {
            if (!r.isVisible) {
              r.animationId = requestAnimationFrame(loop);
              return;
            }
            r.uniforms.time.value += 0.008;
            r.renderer.render(r.scene, r.camera);
            r.animationId = requestAnimationFrame(loop);
          };
          r.animationId = requestAnimationFrame(loop);
        }
      } catch {
        applyFallback();
      }
    };

    initAndAnimate();

    // ResizeObserver — size from container not window
    r.observer = new ResizeObserver(() => {
      if (!r.renderer || !r.uniforms) return;
      const { w, h } = getSize();
      r.renderer.setSize(w, h, false);
      r.uniforms.resolution.value = [w, h];
      if (r.scene && r.camera) r.renderer.render(r.scene, r.camera);
    });
    r.observer.observe(container);

    // Pause when off-screen
    r.intersectionObserver = new IntersectionObserver(
      ([entry]) => { r.isVisible = entry.isIntersecting; },
      { threshold: 0.1 }
    );
    r.intersectionObserver.observe(container);

    return () => {
      if (r.animationId) cancelAnimationFrame(r.animationId);
      r.observer?.disconnect();
      r.intersectionObserver?.disconnect();
      if (r.mesh) {
        r.scene?.remove(r.mesh);
        r.mesh.geometry?.dispose();
        if (r.mesh.material && typeof r.mesh.material.dispose === 'function') {
          r.mesh.material.dispose();
        }
      }
      r.renderer?.dispose();
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden" aria-hidden>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block pointer-events-none"
        aria-hidden
      />
    </div>
  );
}

// ─── Public export — SSR-safe via next/dynamic ─────────────────────────────
export const WebGLShader = dynamic(() => Promise.resolve(WebGLShaderInner), {
  ssr: false,
  loading: () => (
    <div
      className="absolute inset-0"
      style={{ background: 'linear-gradient(135deg,#0f1c3f 0%,#0e2264 45%,#1a3a8a 100%)' }}
      aria-hidden
    />
  ),
});
