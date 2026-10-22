'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

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

function RelayAnimatedPanelInner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  const refs = useRef<ShaderRefs>({
    scene: null,
    camera: null,
    renderer: null,
    mesh: null,
    uniforms: null,
    animationId: null,
    observer: null,
    intersectionObserver: null,
    isVisible: true,
    reducedMotion: false,
  });

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const r = refs.current;

    // Check prefers-reduced-motion
    r.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Vertex shader: Full-viewport orthographic plane
    const vertexShader = `
      attribute vec3 position;
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;

    // Specialized Relay Blue Ribbon fragment shader:
    // - Full-height seamless coordinate normalization using resolution.y
    // - 5 ribbon tiers covering the entire vertical height from top to bottom
    // - Curated palette: Deep navy base (#070D22), royal navy (#0B1536), electric blue (#2563EB, #3478FF),
    //   and restrained cyan highlights (#40C9FF).
    // - Zero horizontal seams, zero rectangular clipping boundaries, pure continuous flowing ribbons.
    const fragmentShader = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;
      uniform float reducedMotion;

      void main() {
        // Normalized coordinates: uv.y is -0.5 at bottom, +0.5 at top.
        // Scaling by resolution.y preserves true geometric aspect ratio across all DPRs.
        vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;

        // Elegant diagonal trajectory (-22 degrees)
        float angle = -0.38;
        float cA = cos(angle);
        float sA = sin(angle);
        mat2 rot = mat2(cA, -sA, sA, cA);
        vec2 p = rot * uv;

        // Smooth time variable (stops when reducedMotion is active)
        float t = (reducedMotion > 0.5) ? 0.0 : time * 0.13;

        // Deep navy base: #070D22
        vec3 col = vec3(0.027, 0.051, 0.133);

        // Curated brand palette
        vec3 deepNavy      = vec3(0.027, 0.051, 0.133); // #070D22
        vec3 midNavy       = vec3(0.043, 0.082, 0.212); // #0B1536
        vec3 royalNavy     = vec3(0.075, 0.165, 0.412); // #132A69
        vec3 relayBlue     = vec3(0.145, 0.388, 0.922); // #2563EB (Relay brand primary)
        vec3 electricBlue  = vec3(0.204, 0.471, 1.000); // #3478FF (Vibrant electric)
        vec3 cyanHighlight = vec3(0.251, 0.788, 1.000); // #40C9FF (Restrained subtle cyan highlight)

        // Subtle ambient background illumination
        float bgWave = sin(p.x * 1.5 + p.y * 1.3 + t * 0.4) * 0.5 + 0.5;
        col = mix(col, midNavy, bgWave * 0.40);

        // 5 Ribbon Tiers distributed evenly across the entire vertical height:
        // p.y ranges approximately from -0.65 (bottom) to +0.65 (top).

        // ── Tier 1: Top Ribbon (Upper Quadrant) ──────────────────────────
        float w1 = sin(p.x * 2.2 + t * 1.2) * 0.18 + cos(p.x * 1.3 - t * 0.8) * 0.10;
        float d1 = p.y - (0.38 + w1);
        float r1 = smoothstep(0.28, 0.0, abs(d1));
        float r1Core = smoothstep(0.09, 0.0, abs(d1));
        float r1Edge = smoothstep(0.022, 0.0, abs(abs(d1) - 0.15));
        vec3 col1 = mix(relayBlue * 0.75, electricBlue, r1Core);
        col1 = mix(col1, cyanHighlight, r1Edge * 0.70);
        col = mix(col, col1, r1 * 0.84);

        // ── Tier 2: Mid-Upper Ribbon ────────────────────────────────────
        float w2 = sin(p.x * 2.7 - t * 1.35 + 1.2) * 0.22 + sin(p.x * 1.1 + t * 0.7) * 0.12;
        float d2 = p.y - (0.18 + w2);
        float r2 = smoothstep(0.30, 0.0, abs(d2));
        float r2Core = smoothstep(0.10, 0.0, abs(d2));
        float r2Edge = smoothstep(0.022, 0.0, abs(abs(d2) - 0.17));
        vec3 col2 = mix(royalNavy, electricBlue * 0.95, r2Core);
        col2 = mix(col2, cyanHighlight, r2Edge * 0.75);
        col = mix(col, col2, r2 * 0.88);

        // Depth shadow between Tier 2 and 3
        float sh2 = smoothstep(0.0, 0.20, d2) * smoothstep(0.38, 0.20, d2);
        col = mix(col, deepNavy * 0.5, sh2 * 0.40);

        // ── Tier 3: Central Primary Ribbon (Centerpiece) ─────────────────
        float w3 = sin(p.x * 1.9 + t * 1.1 + 2.4) * 0.26 + cos(p.x * 2.5 - t * 0.6) * 0.14;
        float d3 = p.y - (-0.02 + w3);
        float r3 = smoothstep(0.34, 0.0, abs(d3));
        float r3Core = smoothstep(0.12, 0.0, abs(d3));
        float r3Edge = smoothstep(0.025, 0.0, abs(abs(d3) - 0.21));
        vec3 col3 = mix(relayBlue * 0.88, electricBlue, r3Core);
        col3 = mix(col3, cyanHighlight, r3Edge * 0.85);
        col = mix(col, col3, r3 * 0.94);

        // Depth shadow between Tier 3 and 4
        float sh3 = smoothstep(0.0, 0.22, d3) * smoothstep(0.40, 0.22, d3);
        col = mix(col, deepNavy * 0.5, sh3 * 0.42);

        // ── Tier 4: Mid-Lower Ribbon ────────────────────────────────────
        float w4 = sin(p.x * 2.4 - t * 1.3 + 3.9) * 0.21 + sin(p.x * 1.5 + t * 0.85) * 0.12;
        float d4 = p.y - (-0.24 + w4);
        float r4 = smoothstep(0.30, 0.0, abs(d4));
        float r4Core = smoothstep(0.10, 0.0, abs(d4));
        float r4Edge = smoothstep(0.022, 0.0, abs(abs(d4) - 0.16));
        vec3 col4 = mix(royalNavy * 0.9, electricBlue * 0.88, r4Core);
        col4 = mix(col4, cyanHighlight, r4Edge * 0.72);
        col = mix(col, col4, r4 * 0.86);

        // ── Tier 5: Bottom Ribbon (Lower Quadrant) ──────────────────────
        float w5 = sin(p.x * 2.1 + t * 0.95 + 5.1) * 0.19 + cos(p.x * 1.2 - t * 0.75) * 0.10;
        float d5 = p.y - (-0.44 + w5);
        float r5 = smoothstep(0.28, 0.0, abs(d5));
        float r5Core = smoothstep(0.09, 0.0, abs(d5));
        float r5Edge = smoothstep(0.022, 0.0, abs(abs(d5) - 0.14));
        vec3 col5 = mix(relayBlue * 0.78, electricBlue * 0.82, r5Core);
        col5 = mix(col5, cyanHighlight, r5Edge * 0.65);
        col = mix(col, col5, r5 * 0.82);

        // Soft peripheral vignette at boundary to ensure crisp contrast with borders
        vec2 normPos = (gl_FragCoord.xy / resolution.xy) - 0.5;
        float vignette = smoothstep(0.42, 0.72, length(normPos));
        col = mix(col, deepNavy, vignette * 0.45);

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const getSize = () => {
      const rect = container.getBoundingClientRect();
      return {
        w: Math.max(Math.floor(rect.width || container.clientWidth || 300), 200),
        h: Math.max(Math.floor(rect.height || container.clientHeight || 400), 200),
      };
    };

    let THREE: typeof import('three');

    const initAndAnimate = async () => {
      try {
        THREE = await import('three');
      } catch {
        setWebglFailed(true);
        return;
      }

      try {
        r.scene = new THREE.Scene();
        r.renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        });

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        r.renderer.setPixelRatio(dpr);
        r.renderer.setClearColor(new THREE.Color(0x070d22));
        r.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, -1);

        const { w, h } = getSize();
        r.renderer.setSize(w, h, false);

        // Pass actual drawing buffer dimensions to ensure 1:1 pixel precision without seam artifacts
        r.uniforms = {
          resolution: { value: [canvas.width, canvas.height] },
          time: { value: 0.0 },
          reducedMotion: { value: r.reducedMotion ? 1.0 : 0.0 },
        };

        const positions = new THREE.BufferAttribute(
          new Float32Array([
            -1, -1, 0,
             1, -1, 0,
            -1,  1, 0,
             1, -1, 0,
            -1,  1, 0,
             1,  1, 0,
          ]),
          3
        );
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', positions);

        const material = new THREE.RawShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms: r.uniforms,
          side: THREE.DoubleSide,
        });

        r.mesh = new THREE.Mesh(geometry, material);
        r.scene.add(r.mesh);

        // Render initial frame
        r.renderer.render(r.scene, r.camera);

        if (!r.reducedMotion) {
          const loop = () => {
            if (!r.isVisible) {
              r.animationId = requestAnimationFrame(loop);
              return;
            }
            r.uniforms.time.value += 0.012;
            r.renderer.render(r.scene, r.camera);
            r.animationId = requestAnimationFrame(loop);
          };
          r.animationId = requestAnimationFrame(loop);
        }
      } catch (e) {
        console.warn('WebGL init error, using CSS fallback:', e);
        setWebglFailed(true);
      }
    };

    initAndAnimate();

    // ResizeObserver scoped to container
    r.observer = new ResizeObserver(() => {
      if (!r.renderer || !r.uniforms) return;
      const { w, h } = getSize();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      r.renderer.setPixelRatio(dpr);
      r.renderer.setSize(w, h, false);
      r.uniforms.resolution.value = [canvas.width, canvas.height];
      if (r.scene && r.camera) {
        r.renderer.render(r.scene, r.camera);
      }
    });
    r.observer.observe(container);

    // Pause rendering when scrolled out of view
    r.intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        r.isVisible = entry.isIntersecting;
      },
      { threshold: 0.05 }
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
    <div
      ref={containerRef}
      className="relative w-full h-full rounded-[24px] lg:rounded-[28px] overflow-hidden bg-[#070D22] shadow-2xl flex items-center justify-center select-none"
      style={{
        border: '1px solid rgba(255, 255, 255, 0.08)',
        transform: 'translateZ(0)',
        WebkitMaskImage: '-webkit-radial-gradient(white, black)',
      }}
      aria-label="RelayAI brand panel"
    >
      {/* Background Canvas (WebGL) */}
      {!webglFailed ? (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full block pointer-events-none"
          aria-hidden="true"
        />
      ) : (
        /* CSS Animated Ribbon Fallback */
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div
            className="absolute -inset-[50%] opacity-85 animate-[spin_24s_linear_infinite]"
            style={{
              background:
                'radial-gradient(ellipse at 35% 30%, rgba(52,120,255,0.7) 0%, rgba(37,99,235,0.4) 35%, transparent 70%), radial-gradient(ellipse at 65% 70%, rgba(64,201,255,0.6) 0%, rgba(37,99,235,0.4) 40%, transparent 75%), linear-gradient(135deg, #070D22 0%, #0B1536 50%, #070D22 100%)',
            }}
          />
        </div>
      )}

      {/* Dark Subtle Overlay for guaranteed pure text legibility */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-[#070D22]/20 via-transparent to-[#070D22]/40 pointer-events-none"
        aria-hidden="true"
      />

      {/* Static Pure-White Block Wordmark: RelayAI */}
      <div className="relative z-10 flex items-center justify-center px-6 pointer-events-none text-center select-none">
        <h1
          className="text-white font-extrabold tracking-[-0.04em] leading-none m-0"
          style={{
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            fontSize: 'clamp(2.4rem, 4.5vw, 4.8rem)',
            fontWeight: 800,
            color: '#FFFFFF',
            textShadow: 'none',
            filter: 'none',
          }}
        >
          RelayAI
        </h1>
      </div>
    </div>
  );
}

export const RelayAnimatedPanel = dynamic(
  () => Promise.resolve(RelayAnimatedPanelInner),
  {
    ssr: false,
    loading: () => (
      <div
        className="relative w-full h-full rounded-[24px] lg:rounded-[28px] overflow-hidden bg-[#070D22] flex items-center justify-center"
        aria-hidden="true"
      >
        <h1
          className="text-white font-extrabold tracking-tight"
          style={{ fontSize: 'clamp(2.4rem, 4.5vw, 4.8rem)', fontWeight: 800 }}
        >
          RelayAI
        </h1>
      </div>
    ),
  }
);

export default RelayAnimatedPanel;
