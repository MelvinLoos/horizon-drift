varying vec3 vWorldPosition;
uniform vec3 uTopColor;
uniform vec3 uMidColor;
uniform vec3 uHorizonColor;
uniform vec3 uSunColor;
uniform vec3 uCelestialDir;
uniform float uNightFactor;
uniform float uTime;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = p * 2.04 + vec2(1.7, 9.2);
        a *= 0.5;
    }
    return v;
}

void main() {
    vec3 dir = normalize(vWorldPosition);
    float h = clamp(dir.y, 0.0, 1.0);

    // Atmospheric Rayleigh/Mie gradient
    vec3 col = mix(uHorizonColor, uMidColor, pow(smoothstep(0.0, 0.28, h), 0.85));
    col = mix(col, uTopColor, smoothstep(0.20, 0.78, h));

    // Dynamic glow around the active Sun or Moon position
    vec3 sunDir = normalize(uCelestialDir);
    float sunAmt = max(dot(dir, sunDir), 0.0);
    float aboveHorizon = smoothstep(-0.08, 0.06, sunDir.y);
    col += uSunColor * pow(sunAmt, 7.0) * 0.38 * aboveHorizon;
    col += uHorizonColor * pow(sunAmt, 2.5) * 0.18 * aboveHorizon;

    // Soft drifting high-altitude cirrus/stratus cloud bands
    if (h > 0.015) {
        vec2 uv = dir.xz / (h + 0.14);
        float c1 = fbm(uv * 1.1 + vec2(uTime * 0.018, -uTime * 0.012));
        float c2 = fbm(uv * 2.3 - vec2(uTime * 0.01, uTime * 0.015));
        float cloudMask = smoothstep(0.46, 0.78, c1 * 0.65 + c2 * 0.35);
        float horizonFade = smoothstep(0.02, 0.18, h) * (1.0 - smoothstep(0.42, 0.85, h));

        // Under-lit clouds near sun or silver-lit clouds under moonlight
        vec3 dayCloud = mix(uMidColor * 1.25, uHorizonColor * 1.35 + uSunColor * 0.35, pow(sunAmt, 2.2));
        vec3 nightCloud = mix(uTopColor * 1.4, vec3(0.38, 0.55, 0.78), pow(sunAmt, 2.5) * 0.65);
        vec3 cloudCol = mix(dayCloud, nightCloud, uNightFactor);
        col = mix(col, cloudCol, cloudMask * horizonFade * 0.58);
    }

    gl_FragColor = vec4(col, 1.0);
}

