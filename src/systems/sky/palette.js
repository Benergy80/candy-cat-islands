// ─────────────────────────────────────────────────────────────────────────────
// SKY COLOUR GRADE — hand-authored keyframes across the 24h clock.
//
// IMPORTANT colour-space note (this is why the horizon seam is invisible):
// all sky meshes use raw ShaderMaterials with NO tonemapping/colorspace chunks,
// so whatever we write lands in the framebuffer as literal sRGB. three.js also
// applies `scene.fog` AFTER tone mapping + output conversion (see
// meshphysical.glsl.js: opaque → tonemapping → colorspace → fog), and uploads
// fog.color converted to the renderer's OUTPUT colour space. So an sRGB hex
// used for BOTH the dome horizon and the fog matches pixel-for-pixel, and
// `renderer.toneMappingExposure` only grades the lit world.
// That lets us treat the sky as a painted cyclorama and expose the scene on top.
// (`hzD` below deliberately breaks that match by a few percent so the SEA has
// an edge to end on — see sky.js "sea-horizon band".)
//
// LIGHT RIG SHAPE (the thing that gives the sun authority over the world):
//   key  = warm directional from the sun, casts shadows            → sunC/sunI
//   fill = COOL directional from the ANTI-KEY side, no shadows      → fillC/fillI
//   bounce = hemisphere, sky above / island-tinted ground below      → hSky/hGnd/hI
//   wash = ambient; ALSO added un-multiplied into dark pixels        → ambC/ambI
//          (see the "darkness-weighted sky wash" patch in sky.js — ambC is the
//           colour a crushed shadow or an unlit night surface turns TOWARD)
//
// RATIOS, not levels (rewritten in wave 2c; the previous note here said "keep
// hI LOW and sunI HIGH" and that is exactly what produced 26:1 noon shadows
// that read as black stencils, and a night that was a brightness multiply):
//   • DAY    key:fill ≈ 5.5:1 measured on flat ground. Sunlight really is ~6×
//            skylight on a clear day; below ~4:1 it goes milky, above ~8:1 the
//            shadows stop being a colour and start being a hole.
//   • DUSK   the sun is 3° up, so the ground gets almost NO key — the frame is
//            carried by a bright warm hemisphere + a saturated cool fill, with
//            the key raking only the vertical faces that point west. Measured
//            mean ≈ 80/255: dusk must be BRIGHTER than night, not darker.
//   • NIGHT  the moon is a real key at ~13:1 over the bounce, cool blue-violet,
//            and it CASTS. moonI 3.2 with exposure cut HARD to 0.40 — that pair
//            is deliberate: it holds the night level where it was while tripling
//            the share of every pixel that comes from a DIRECTION, which is the
//            only way to out-shout the flat `uNight` emissive other systems add
//            to their candy. Lamps and window glow stay the only saturated warm
//            colour and the p95 stops blowing out. Measured: pier 21:23 mean
//            46 / p95 118 (was 49 / 132 with a 26%-of-midday night), Main
//            Street 22:00 mean 38 / p95 136 (was 47 / 181).
//
// DAWN (04:40 → 06:45) is authored as a five-key ramp, because the HUD dial
// calls 05:00–07:00 "sunrise" and the world has to agree with the label:
//   4.60  nautical twilight — indigo, a purple stain in the east, stars out
//   5.20  civil twilight    — rose horizon under a still-cold zenith
//   5.60  BREAK OF DAY      — the disc touches the horizon, first warm key
//   5.95  SUNRISE           — low orange key, long shadows, bright warm band
//   6.50  golden morning    — the key climbs and cools toward day
// The sun's own geometry (sky.js SUNRISE = 5.45) is matched to this table: at
// 05:53 the disc is genuinely ~4° up, so the key really does rake in from
// the east instead of being a colour grade pretending.
//
// Every field is linearly interpolated between the two surrounding keys with a
// smoothstep ease. Colours are stored/interpolated in sRGB (not linear) so that
// blue→amber transitions stay bright instead of dipping through mud.
// ─────────────────────────────────────────────────────────────────────────────

const S = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/**
 * Keys, in clock order. `t` is the hour. The table wraps (24 == 0).
 *   zen/mid/hor  sky dome gradient stops (zenith / mid band / horizon)
 *   halo,haloS   broad glow painted around the sun/moon on the dome
 *   band,bandS   warm band on the sun's side; its HEIGHT tracks sun elevation
 *   lineC,lineS  the thin bright HORIZON GLOW LINE (keeps the sea from
 *                dissolving into the sky at dawn/dusk)
 *   hzD          how far the far haze is pushed darker/greyer than the dome
 *                horizon — this is the "sea-horizon band" (0 = invisible seam)
 *   mHalo        extra gain on the moon's dome glow (night only)
 *   mistC        colour of the low sea mist plane
 *   sunC,sunI    warm key directional light (casts shadows)
 *   fillC,fillI  cool counter-fill directional from the ANTI-KEY side
 *   moonC,moonI  night key directional light
 *   hSky,hGnd    hemisphere sky colour and the per-phase ground-bounce tint
 *   hI           hemisphere intensity  (the skylight — this is the shadow FILL)
 *   gSat         how much of the island's ground-bounce hue survives (0..1)
 *   ambC,ambI    ambient: diffuse lift AND the colour of the darkness-weighted
 *                sky wash (sky.js) — i.e. what a crushed shadow turns toward
 *   exp          renderer.toneMappingExposure
 *   starA        starfield + moon opacity
 *   discC,coreC,glowC,glowS   sun billboard
 *   cLit,cShad,cRim,cRimS     cartoon cloud shading
 *   fogN,fogF    fog near/far (before camera-pitch and fogScale modifiers)
 */
export const KEYS = [
  { t: 0.0,  zen: 0x0a1130, mid: 0x151d44, hor: 0x2b3160, halo: 0x63729e, haloS: 0.30, band: 0x3a4272, bandS: 0.26,
    lineC: 0x5a6a9c, lineS: 0.32, hzD: 0.30, mHalo: 1.00, mistC: 0x59668e,
    sunC: 0x6a7ab0, sunI: 0.0, fillC: 0x4a5ea8, fillI: 0.34, moonC: 0x8fa6ee, moonI: 3.00,
    hSky: 0x2c3c74, hGnd: 0x2e3660, hI: 0.44, gSat: 0.10, ambC: 0x3a4c92, ambI: 0.34,
    exp: 0.355, starA: 1.0,
    discC: 0xffe6bc, coreC: 0xfffbef, glowC: 0xffd9a0, glowS: 0.0,
    cLit: 0x46527e, cShad: 0x171c3c, cRim: 0x8c9cc8, cRimS: 0.32, fogN: 50, fogF: 300 },

  { t: 3.6,  zen: 0x080e28, mid: 0x121a3e, hor: 0x262c58, halo: 0x5a678e, haloS: 0.28, band: 0x343c6a, bandS: 0.24,
    lineC: 0x52628f, lineS: 0.30, hzD: 0.30, mHalo: 1.00, mistC: 0x56628a,
    sunC: 0x6a7ab0, sunI: 0.0, fillC: 0x46589e, fillI: 0.33, moonC: 0x8ea2ea, moonI: 2.85,
    hSky: 0x283566, hGnd: 0x2c345c, hI: 0.42, gSat: 0.10, ambC: 0x364690, ambI: 0.32,
    exp: 0.360, starA: 1.0,
    discC: 0xffe6bc, coreC: 0xfffbef, glowC: 0xffd9a0, glowS: 0.0,
    cLit: 0x414c78, cShad: 0x151a38, cRim: 0x8696c2, cRimS: 0.30, fogN: 50, fogF: 300 },

  // ── DAWN RAMP ──────────────────────────────────────────────────────────────
  // 4.60 · nautical twilight. Sky still night-blue overhead, but the eastern
  // horizon has taken a first purple stain and the mist is building on the sea.
  { t: 4.6,  zen: 0x101a42, mid: 0x252c5e, hor: 0x4a3a6e, halo: 0x7c5484, haloS: 0.36, band: 0x6a4070, bandS: 0.36,
    lineC: 0x8a5c86, lineS: 0.34, hzD: 0.34, mHalo: 0.85, mistC: 0x9aa8cc,
    sunC: 0x8e7ab0, sunI: 0.0, fillC: 0x566a9e, fillI: 0.32, moonC: 0x96a8e4, moonI: 1.65,
    hSky: 0x33427a, hGnd: 0x3c4270, hI: 0.50, gSat: 0.20, ambC: 0x3e4c8e, ambI: 0.34,
    exp: 0.460, starA: 0.88,
    discC: 0xffc79c, coreC: 0xfff0dc, glowC: 0xff9a86, glowS: 0.20,
    cLit: 0x545080, cShad: 0x201e44, cRim: 0x9a6690, cRimS: 0.36, fogN: 50, fogF: 304 },

  // 5.20 · civil twilight. THE cool-to-warm gradient: rose/magenta horizon,
  // lavender mid, a zenith that is still properly cold night blue.
  { t: 5.2,  zen: 0x1b2c62, mid: 0x4a4382, hor: 0xb06a84, halo: 0xe07a80, haloS: 0.54, band: 0xd06a80, bandS: 0.58,
    lineC: 0xff9c8e, lineS: 0.66, hzD: 0.46, mHalo: 0.45, mistC: 0xbfa8c6,
    sunC: 0xd4808c, sunI: 0.80, fillC: 0x6076b4, fillI: 0.44, moonC: 0x9aacdc, moonI: 0.55,
    hSky: 0x7a6a9e, hGnd: 0x6a5686, hI: 0.62, gSat: 0.42, ambC: 0x7a6480, ambI: 0.28,
    exp: 0.76, starA: 0.52,
    discC: 0xffb489, coreC: 0xffe6c8, glowC: 0xff8a72, glowS: 0.55,
    cLit: 0xa8779a, cShad: 0x342a58, cRim: 0xe08a94, cRimS: 0.60, fogN: 52, fogF: 312 },

  // 5.60 · BREAK OF DAY. The disc is on the horizon (sky.js SUNRISE = 5.45), so
  // the key is real, raking and orange. Stars are nearly out; lamps are dying.
  { t: 5.6,  zen: 0x25478e, mid: 0x8a6aa2, hor: 0xf08a72, halo: 0xff9a72, haloS: 0.74, band: 0xff8e66, bandS: 0.78,
    lineC: 0xffcc9a, lineS: 0.95, hzD: 0.55, mHalo: 0.14, mistC: 0xd9bcba,
    sunC: 0xff8e62, sunI: 4.40, fillC: 0x7e8cc4, fillI: 0.50, moonC: 0xa6b4d4, moonI: 0.08,
    hSky: 0xb894a4, hGnd: 0x9a7290, hI: 0.50, gSat: 0.72, ambC: 0x7e74a4, ambI: 0.24,
    exp: 1.05, starA: 0.20,
    discC: 0xffa06a, coreC: 0xffe2b4, glowC: 0xff7a56, glowS: 0.95,
    cLit: 0xe89a8a, cShad: 0x4a3a6c, cRim: 0xffa070, cRimS: 0.82, fogN: 54, fogF: 318 },

  // 5.95 · SUNRISE. This is the frame the HUD labels 05:53 SUNRISE: low orange
  // key from the east, long shadows, warm band sitting on a cold zenith.
  { t: 5.95, zen: 0x2f62ae, mid: 0xa484b4, hor: 0xffab74, halo: 0xffb27e, haloS: 0.68, band: 0xffa068, bandS: 0.72,
    lineC: 0xffe2b4, lineS: 0.88, hzD: 0.52, mHalo: 0.0, mistC: 0xebccbc,
    sunC: 0xffa262, sunI: 6.80, fillC: 0x8296d0, fillI: 0.46, moonC: 0xa8c0ff, moonI: 0.0,
    hSky: 0xd8b0a8, hGnd: 0xc09098, hI: 0.42, gSat: 0.90, ambC: 0x9086b8, ambI: 0.22,
    exp: 1.10, starA: 0.05,
    discC: 0xffbe86, coreC: 0xfff0d4, glowC: 0xff9060, glowS: 0.88,
    cLit: 0xffc0a0, cShad: 0x7a6a9e, cRim: 0xffb680, cRimS: 0.74, fogN: 56, fogF: 320 },

  // 6.50 · golden morning. Key climbing, mist thinning, lamps out.
  { t: 6.5,  zen: 0x3f72b4, mid: 0xa98fc6, hor: 0xffc09a, halo: 0xffc79a, haloS: 0.58, band: 0xffb489, bandS: 0.58,
    lineC: 0xfff0d2, lineS: 0.50, hzD: 0.40, mHalo: 0.0, mistC: 0xf2dccc,
    sunC: 0xffb082, sunI: 5.20, fillC: 0x8298d4, fillI: 0.44, moonC: 0xa8c0ff, moonI: 0.0,
    hSky: 0xe0bfb0, hGnd: 0xb896b4, hI: 0.46, gSat: 0.92, ambC: 0xa494b6, ambI: 0.20,
    exp: 0.95, starA: 0.0,
    discC: 0xffcfa6, coreC: 0xfff6e4, glowC: 0xffa887, glowS: 0.80,
    cLit: 0xffcdb4, cShad: 0x8272a6, cRim: 0xffd0a2, cRimS: 0.62, fogN: 56, fogF: 312 },

  { t: 7.6,  zen: 0x3183d2, mid: 0x8fc0e8, hor: 0xffdfc2, halo: 0xffe0b8, haloS: 0.42, band: 0xffd7b0, bandS: 0.44,
    lineC: 0xfff6e2, lineS: 0.30, hzD: 0.26, mHalo: 0.0, mistC: 0xf6e8dc,
    sunC: 0xffd0a0, sunI: 4.20, fillC: 0x86aeea, fillI: 0.40, moonC: 0xa8c0ff, moonI: 0.0,
    hSky: 0xc4cfe8, hGnd: 0xf0c0b4, hI: 0.46, gSat: 0.90, ambC: 0xd0ac96, ambI: 0.20,
    exp: 0.79, starA: 0.0,
    discC: 0xffe8c4, coreC: 0xfffaf0, glowC: 0xffc79a, glowS: 0.55,
    cLit: 0xfff0e2, cShad: 0xa294b4, cRim: 0xffe2bc, cRimS: 0.45, fogN: 58, fogF: 330 },

  { t: 9.5,  zen: 0x2b7fd4, mid: 0x6cb5ea, hor: 0xd6ecf0, halo: 0xfff0d2, haloS: 0.30, band: 0xffe8c4, bandS: 0.34,
    lineC: 0xffffff, lineS: 0.20, hzD: 0.20, mHalo: 0.0, mistC: 0xf4f0ea,
    sunC: 0xffe6b6, sunI: 4.10, fillC: 0x80a8ea, fillI: 0.36, moonC: 0xa8c0ff, moonI: 0.0,
    hSky: 0xa2cefa, hGnd: 0xffdfcc, hI: 0.42, gSat: 1.0, ambC: 0xffcda8, ambI: 0.18,
    exp: 0.76, starA: 0.0,
    discC: 0xfff6e0, coreC: 0xfffdf6, glowC: 0xffe8bc, glowS: 0.38,
    cLit: 0xffffff, cShad: 0xa6bfda, cRim: 0xfff2d8, cRimS: 0.34, fogN: 60, fogF: 344 },

  { t: 13.0, zen: 0x1f74d0, mid: 0x5fb0ea, hor: 0xdcf0f2, halo: 0xfff4de, haloS: 0.26, band: 0xffeed2, bandS: 0.28,
    lineC: 0xffffff, lineS: 0.18, hzD: 0.18, mHalo: 0.0, mistC: 0xf4f0ea,
    sunC: 0xffeec4, sunI: 4.10, fillC: 0x7ca6ea, fillI: 0.36, moonC: 0xa8c0ff, moonI: 0.0,
    hSky: 0xa6d2ff, hGnd: 0xffe2cc, hI: 0.42, gSat: 1.0, ambC: 0xffcda8, ambI: 0.18,
    exp: 0.76, starA: 0.0,
    discC: 0xfffbee, coreC: 0xffffff, glowC: 0xfff0cc, glowS: 0.32,
    cLit: 0xffffff, cShad: 0xa8c2e0, cRim: 0xfff6e2, cRimS: 0.30, fogN: 62, fogF: 356 },

  { t: 16.0, zen: 0x2a7cc8, mid: 0x7cb9e2, hor: 0xefe8d0, halo: 0xffeab0, haloS: 0.36, band: 0xffdca8, bandS: 0.42,
    lineC: 0xfff6e0, lineS: 0.24, hzD: 0.22, mHalo: 0.0, mistC: 0xf2ece2,
    sunC: 0xffe4ae, sunI: 4.10, fillC: 0x80a4e8, fillI: 0.36, moonC: 0xa8c0ff, moonI: 0.0,
    hSky: 0xa2cef4, hGnd: 0xffdcbe, hI: 0.43, gSat: 1.0, ambC: 0xffc8a4, ambI: 0.19,
    exp: 0.77, starA: 0.0,
    discC: 0xfff2d0, coreC: 0xfffcf0, glowC: 0xffd9a0, glowS: 0.46,
    cLit: 0xffecc8, cShad: 0x9eaac8, cRim: 0xffd48c, cRimS: 0.52, fogN: 60, fogF: 344 },

  { t: 17.5, zen: 0x2f7cc6, mid: 0x8fbbdf, hor: 0xffdca8, halo: 0xffd28e, haloS: 0.52, band: 0xffc47e, bandS: 0.60,
    lineC: 0xffe8b0, lineS: 0.42, hzD: 0.34, mHalo: 0.0, mistC: 0xeee0d0,
    sunC: 0xffc37e, sunI: 4.30, fillC: 0x6f97e2, fillI: 0.48, moonC: 0xa8c0ff, moonI: 0.0,
    hSky: 0x92bfee, hGnd: 0xffcda4, hI: 0.48, gSat: 1.0, ambC: 0xffb894, ambI: 0.18,
    exp: 0.88, starA: 0.0,
    discC: 0xffdfa2, coreC: 0xfff8e2, glowC: 0xffb474, glowS: 0.68,
    cLit: 0xffd28c, cShad: 0x8474a4, cRim: 0xffa845, cRimS: 0.80, fogN: 58, fogF: 330 },

  { t: 18.7, zen: 0x2c62a8, mid: 0xc4a0b4, hor: 0xffa662, halo: 0xffa262, haloS: 0.72, band: 0xff9550, bandS: 0.78,
    lineC: 0xffc482, lineS: 0.80, hzD: 0.48, mHalo: 0.05, mistC: 0xe2c8bc,
    sunC: 0xffa25c, sunI: 4.80, fillC: 0x6a8ede, fillI: 0.58, moonC: 0xa8c0ff, moonI: 0.0,
    hSky: 0x8aa6d4, hGnd: 0xffb28c, hI: 0.54, gSat: 0.95, ambC: 0xc08a80, ambI: 0.18,
    exp: 1.02, starA: 0.0,
    discC: 0xffb471, coreC: 0xfff0cc, glowC: 0xff8a52, glowS: 0.92,
    cLit: 0xfaa966, cShad: 0x745c90, cRim: 0xff8524, cRimS: 0.92, fogN: 56, fogF: 322 },

  { t: 19.2, zen: 0x27447f, mid: 0xa06ea4, hor: 0xff7c4e, halo: 0xff8a4e, haloS: 0.88, band: 0xff6f46, bandS: 0.90,
    lineC: 0xffa070, lineS: 0.95, hzD: 0.56, mHalo: 0.12, mistC: 0xd8b4b4,
    sunC: 0xff8a52, sunI: 5.00, fillC: 0x5f7fd0, fillI: 0.75, moonC: 0xa8c0ff, moonI: 0.06,
    hSky: 0x8f94c4, hGnd: 0xf0947e, hI: 0.88, gSat: 0.90, ambC: 0x9a7a96, ambI: 0.24,
    exp: 1.05, starA: 0.03,
    discC: 0xff9a56, coreC: 0xffe0a8, glowC: 0xff6a40, glowS: 1.00,
    cLit: 0xf08a5c, cShad: 0x624680, cRim: 0xff6624, cRimS: 1.00, fogN: 54, fogF: 316 },

  { t: 19.8, zen: 0x1c2c66, mid: 0x6e4088, hor: 0xe2588e, halo: 0xf06a8e, haloS: 0.76, band: 0xd8507e, bandS: 0.80,
    lineC: 0xff90a0, lineS: 0.72, hzD: 0.52, mHalo: 0.35, mistC: 0xc4a0bc,
    sunC: 0xff6d58, sunI: 1.35, fillC: 0x5468b4, fillI: 0.55, moonC: 0x93a8ea, moonI: 0.70,
    hSky: 0x6a6aa8, hGnd: 0x866080, hI: 0.82, gSat: 0.50, ambC: 0x6a5c9a, ambI: 0.30,
    exp: 0.78, starA: 0.22,
    discC: 0xff7a54, coreC: 0xffc48e, glowC: 0xe8567e, glowS: 0.92,
    cLit: 0xd886a2, cShad: 0x4a3468, cRim: 0xf2708e, cRimS: 0.78, fogN: 52, fogF: 326 },

  { t: 20.5, zen: 0x14204f, mid: 0x342a68, hor: 0x6a3870, halo: 0x9c4a80, haloS: 0.50, band: 0x8a3e78, bandS: 0.52,
    lineC: 0xa8608c, lineS: 0.40, hzD: 0.40, mHalo: 0.72, mistC: 0xa494bc,
    sunC: 0xff6d58, sunI: 0.0, fillC: 0x4e62a4, fillI: 0.32, moonC: 0x8fa6ee, moonI: 1.80,
    hSky: 0x3c4a8a, hGnd: 0x564a7c, hI: 0.54, gSat: 0.28, ambC: 0x464a90, ambI: 0.32,
    exp: 0.500, starA: 0.70,
    discC: 0xff7a54, coreC: 0xffc48e, glowC: 0xa8507e, glowS: 0.40,
    cLit: 0x806094, cShad: 0x2c2254, cRim: 0x9c5a84, cRimS: 0.48, fogN: 50, fogF: 312 },

  { t: 21.3, zen: 0x0d1540, mid: 0x1d2352, hor: 0x3c3670, halo: 0x6c6e96, haloS: 0.36, band: 0x484278, bandS: 0.32,
    lineC: 0x72809c, lineS: 0.34, hzD: 0.32, mHalo: 0.95, mistC: 0x5b678f,
    sunC: 0xff6d58, sunI: 0.0, fillC: 0x4a5ea8, fillI: 0.34, moonC: 0x8fa6ee, moonI: 3.00,
    hSky: 0x2f4278, hGnd: 0x3a4068, hI: 0.44, gSat: 0.14, ambC: 0x3e4e94, ambI: 0.34,
    exp: 0.355, starA: 0.92,
    discC: 0xffe6bc, coreC: 0xfffbef, glowC: 0xffd9a0, glowS: 0.0,
    cLit: 0x4c5686, cShad: 0x191e42, cRim: 0x8e9ecc, cRimS: 0.34, fogN: 50, fogF: 302 },

  { t: 24.0, zen: 0x0a1130, mid: 0x151d44, hor: 0x2b3160, halo: 0x63729e, haloS: 0.30, band: 0x3a4272, bandS: 0.26,
    lineC: 0x5a6a9c, lineS: 0.32, hzD: 0.30, mHalo: 1.00, mistC: 0x59668e,
    sunC: 0x6a7ab0, sunI: 0.0, fillC: 0x4a5ea8, fillI: 0.34, moonC: 0x8fa6ee, moonI: 3.00,
    hSky: 0x2c3c74, hGnd: 0x2e3660, hI: 0.44, gSat: 0.10, ambC: 0x3a4c92, ambI: 0.34,
    exp: 0.355, starA: 1.0,
    discC: 0xffe6bc, coreC: 0xfffbef, glowC: 0xffd9a0, glowS: 0.0,
    cLit: 0x46527e, cShad: 0x171c3c, cRim: 0x8c9cc8, cRimS: 0.32, fogN: 50, fogF: 300 },
];

const COLOR_FIELDS = ['zen', 'mid', 'hor', 'halo', 'band', 'lineC', 'mistC', 'sunC', 'fillC', 'moonC', 'hSky', 'hGnd', 'ambC', 'discC', 'coreC', 'glowC', 'cLit', 'cShad', 'cRim'];
const NUM_FIELDS = ['haloS', 'bandS', 'lineS', 'hzD', 'mHalo', 'sunI', 'fillI', 'moonI', 'hI', 'gSat', 'ambI', 'exp', 'starA', 'glowS', 'cRimS', 'fogN', 'fogF'];

// Fallbacks so a key that forgets a newly-added field degrades instead of
// baking NaN into every uniform downstream of it.
const DEFAULTS = { lineC: 0x8c9cc8, mistC: 0xc8d4e6, lineS: 0.2, hzD: 0.25, mHalo: 0 };

// Pre-split every key into sRGB triplets once.
const BAKED = KEYS.map((k) => {
  const o = { t: k.t };
  for (const f of COLOR_FIELDS) o[f] = S(k[f] ?? DEFAULTS[f] ?? 0);
  for (const f of NUM_FIELDS) o[f] = k[f] ?? DEFAULTS[f] ?? 0;
  return o;
});

/** A reusable output object so sampling never allocates. */
export function makeGrade() {
  const g = {};
  for (const f of COLOR_FIELDS) g[f] = [0, 0, 0];
  for (const f of NUM_FIELDS) g[f] = 0;
  return g;
}

const ease = (x) => x * x * (3 - 2 * x);

/** Sample the grade at hour `t` (0..24) into `out` (from makeGrade()). */
export function sampleGrade(t, out) {
  const h = ((t % 24) + 24) % 24;
  let i = 0;
  while (i < BAKED.length - 2 && BAKED[i + 1].t <= h) i++;
  const a = BAKED[i], b = BAKED[i + 1];
  const span = b.t - a.t;
  const u = ease(span > 0 ? Math.min(1, Math.max(0, (h - a.t) / span)) : 0);
  for (const f of COLOR_FIELDS) {
    const ca = a[f], cb = b[f], co = out[f];
    co[0] = ca[0] + (cb[0] - ca[0]) * u;
    co[1] = ca[1] + (cb[1] - ca[1]) * u;
    co[2] = ca[2] + (cb[2] - ca[2]) * u;
  }
  for (const f of NUM_FIELDS) out[f] = a[f] + (b[f] - a[f]) * u;
  return out;
}

/** Coarse named phase used for gameplay hooks. */
export function phaseOf(t) {
  const h = ((t % 24) + 24) % 24;
  if (h >= 4.5 && h < 7.4) return 'dawn';
  if (h >= 7.4 && h < 17.6) return 'day';
  if (h >= 17.6 && h < 20.6) return 'dusk';
  return 'night';
}

/**
 * Street lamps / window glow / lantern master switch, 0..1.
 * 1 = full night lighting, 0 = broad daylight. Lamps come on through dusk and
 * are OUT by 06:21, which is what the dawn ramp above is painted against.
 * `sky.lampsOn` is this crossing 0.5; `sky.lampMix` is the smooth value.
 */
export function lampMixAt(t) {
  const h = ((t % 24) + 24) % 24;
  const up = ease(Math.min(1, Math.max(0, (h - 18.25) / 1.15)));       // 18:15 → 19:24 on
  const down = 1 - ease(Math.min(1, Math.max(0, (h - 5.6) / 0.75)));   // 05:36 → 06:21 off
  if (h >= 12) return up;
  return down;
}
