varying vec2 vUv;
uniform vec3 uSunColor;
uniform vec3 uHorizonColor;
uniform float uIsMoon;
uniform float uOpacity;
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

void main() {
    vec2 p = vUv - vec2(0.5);
    float dist = length(p);
    if (dist > 0.5) discard;

    // Sun rendering
    float sunCore = smoothstep(0.19, 0.145, dist);
    float sunInnerGlow = exp(-dist * 7.5) * 0.78;
    float sunOuterCorona = exp(-dist * 3.8) * 0.35 * smoothstep(0.5, 0.2, dist);
    vec3 sunCol = mix(uHorizonColor, uSunColor, smoothstep(0.0, 0.65, vUv.y));
    sunCol = mix(sunCol, vec3(1.0, 0.98, 0.94), sunCore * 0.85);
    float sunAlpha = clamp(sunCore + sunInnerGlow + sunOuterCorona, 0.0, 1.0);

    // Moon rendering (crisp lunar disc with subtle maria craters & silver halo)
    float moonRadius = 0.145;
    float moonDisc = smoothstep(moonRadius, moonRadius - 0.008, dist);
    float craters = noise(p * 26.0) * 0.55 + noise(p * 54.0) * 0.35;
    float maria = smoothstep(0.35, 0.75, craters);
    // Subtle 3D spherical limb shading
    float limb = sqrt(max(0.0, 1.0 - (dist / moonRadius) * (dist / moonRadius)));
    vec3 moonSurface = mix(vec3(0.58, 0.68, 0.82), vec3(0.92, 0.96, 1.0), maria * 0.7 + limb * 0.3);
    float moonHalo = exp(-dist * 9.5) * 0.52 + exp(-dist * 4.2) * 0.22 * smoothstep(0.5, 0.18, dist);
    vec3 moonCol = mix(vec3(0.45, 0.68, 0.98), moonSurface, moonDisc);
    float moonAlpha = clamp(moonDisc * 0.96 + moonHalo, 0.0, 1.0);

    vec3 finalCol = mix(sunCol, moonCol, uIsMoon);
    float finalAlpha = mix(sunAlpha, moonAlpha, uIsMoon) * uOpacity;

    gl_FragColor = vec4(finalCol, finalAlpha * 0.94);
}

