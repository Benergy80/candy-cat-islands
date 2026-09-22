// Gradient sky dome. Raw sRGB output (no tone mapping) so the authored grade
// lands untouched and matches scene.fog exactly at the horizon line.
import * as THREE from 'three';

export const SKY_R = 620;

export function createDome() {
  const uniforms = {
    uZen: { value: new THREE.Vector3(0.1, 0.4, 0.8) },
    uMid: { value: new THREE.Vector3(0.4, 0.7, 0.95) },
    uHor: { value: new THREE.Vector3(0.9, 0.95, 0.98) },
    uHalo: { value: new THREE.Vector3(1, 0.95, 0.8) },
    uHaloS: { value: 0.3 },
    uBand: { value: new THREE.Vector3(1, 0.9, 0.7) },
    uBandS: { value: 0.35 },
    uBandY: { value: 0.03 },   // band centre height — tracks sun elevation
    uBandW: { value: 11.0 },   // band tightness — loosens as the sun climbs
    uLine: { value: new THREE.Vector3(1, 0.95, 0.85) },
    uLineS: { value: 0.3 },    // the horizon glow LINE — see the shader
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    // whichever luminary owns the warm band + the bright half of the horizon
    // line right now (sun by day, moon by night — they have separate arcs)
    uBandDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonHalo: { value: 0 },   // extra gain on the moon's glow (night only)
    uStarA: { value: 0 },
    uMwCol: { value: new THREE.Vector3(0.30, 0.33, 0.52) },
    uMwAxis: { value: new THREE.Vector3(0.62, 0.42, -0.66).normalize() },
    uOutLin: { value: 0 }, // 1 when rendering into a linear target (post FX)
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vDir;
      uniform vec3 uZen, uMid, uHor, uHalo, uBand, uLine, uSunDir, uMoonDir, uBandDir, uMwCol, uMwAxis;
      uniform float uHaloS, uBandS, uBandY, uBandW, uLineS, uMoonHalo, uStarA, uOutLin;

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;

        // ── three-stop vertical gradient, softened below the horizon ──────────
        float up = clamp(h, 0.0, 1.0);
        vec3 col;
        float lowT = smoothstep(0.0, 0.22, up);           // horizon → mid
        float hiT  = smoothstep(0.16, 0.86, up);          // mid → zenith
        col = mix(uHor, uMid, lowT);
        col = mix(col, uZen, hiT);
        // below the horizon (only ever seen past the sea edge): settle to a
        // slightly deeper horizon so nothing reads as a hole.
        col = mix(col, uHor * 0.82, smoothstep(0.0, -0.22, h));

        // ── night extras: milky way band, painted under the stars ────────────
        if (uStarA > 0.01) {
          float mwd = abs(dot(d, uMwAxis));
          float mw = smoothstep(0.24, 0.0, mwd);
          mw *= 0.55 + 0.45 * sin(dot(d, vec3(9.1, 3.7, 6.3)) * 2.0);
          mw *= smoothstep(-0.05, 0.25, h);
          col += uMwCol * mw * 0.60 * uStarA;
        }

        // ── broad glow around whichever luminary is up ────────────────────────
        float sd = max(dot(d, uSunDir), 0.0);
        float md = max(dot(d, uMoonDir), 0.0);
        float halo = pow(sd, 5.0) * 0.75 + pow(sd, 40.0) * 0.55;
        col = mix(col, uHalo, clamp(halo * uHaloS, 0.0, 0.95));
        // The MOON's glow is its own term and deliberately BROAD (pow 2.6 is a
        // ~60° pool of light). The gameplay camera looks down — at el 0.55 rad
        // with a 30° lens nothing above the horizon is ever in frame — so the
        // only way the moon reads in a wide or tilted-up shot is as a big soft
        // gradient the eye can follow back to the disc.
        float mHalo = pow(md, 22.0) * 0.75 + pow(md, 5.0) * 0.42 + pow(md, 2.6) * 0.20;
        col = mix(col, uHalo, clamp(mHalo * uHaloS * (0.4 + uMoonHalo), 0.0, 0.92));

        // ── warm band on the sun's side, CENTRED ON THE SUN'S OWN HEIGHT so
        //    the glow and the disc are one shape instead of two ───────────────
        vec2 dz = normalize(vec2(d.x, d.z) + 1e-5);
        vec2 sz = normalize(vec2(uBandDir.x, uBandDir.z) + 1e-5);
        float az = max(dot(dz, sz), 0.0);
        float band = pow(az, 2.2) * exp(-abs(h - uBandY) * uBandW);
        col = mix(col, uBand, clamp(band * uBandS, 0.0, 0.9));

        // ── HORIZON GLOW LINE ────────────────────────────────────────────────
        // Without this the sea's far edge is fogged to exactly the dome's
        // horizon colour and the two dissolve into one another — at dusk and
        // dawn the water simply stopped existing somewhere in the haze. A soft
        // ~2° cushion with a tight core inside it gives the sea a lit edge to
        // end against; sky.js pushes the fog a few percent darker than uHor
        // so the water side of that edge is the darker one.
        // It rings the whole horizon (0.58 base) but brightens toward the sun.
        // The base was 0.45, which meant a dawn shot framed AWAY from the sun
        // (the harbour looks north-west) got no glow band at all and read as
        // flat overcast — at 05:53 the anti-sun horizon is still a lit band.
        // centred a hair BELOW h=0: the sea mesh runs out at the far clip, so
        // its edge sits ~1 degree under the true horizon and the line has to
        // meet it there rather than float above it.
        float lineW = exp(-abs(h + 0.009) * 34.0) * 0.86 + exp(-abs(h + 0.011) * 150.0) * 0.70;
        col = mix(col, uLine, clamp(lineW * (0.58 + 0.48 * pow(az, 1.6)) * uLineS, 0.0, 0.90));

        // 8-bit dither: smooth sky gradients band badly otherwise.
        col += (hash12(gl_FragCoord.xy) - 0.5) * (1.6 / 255.0);

        if (uOutLin > 0.5) col = pow(max(col, 0.0), vec3(2.2));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 30, 18), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'skyDome';
  return { mesh, uniforms, material: mat };
}
