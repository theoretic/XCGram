/**
 * Definitions for the six map overlays. Each layer extracts one scalar from a
 * point's derived sounding and maps it to a colour:
 *
 *   diverging  — red (min) … blue (max), opaque        [cloud base, thermal top, inversion]
 *   intensity  — transparent (min) … red (max)         [convection, CAPE]
 *   cloud      — transparent (min) … light grey (max)  [thermal clouds / condensation]
 */
import type { Derived, SoundingProfile } from '../types';

export type LayerId =
    | 'cloudbase'
    | 'thermaltop'
    | 'convection'
    | 'cape'
    | 'inversion'
    | 'thermalclouds';

export type LayerMode = 'diverging' | 'intensity' | 'cloud';

export interface LayerDef {
    id: LayerId;
    label: string;
    unit: string;
    mode: LayerMode;
    /** Fixed [min,max] or 'auto' (computed from the sampled grid). */
    domain: [number, number] | 'auto';
    /** True if the value is a height that respects the AGL/MSL toggle. */
    heightBased?: boolean;
    minLabel: string;
    maxLabel: string;
    /** Scalar for one grid point, or null when not applicable. */
    value: (profile: SoundingProfile, d: Derived, agl: boolean) => number | null;
}

const height = (gh: number | undefined, profile: SoundingProfile, agl: boolean): number | null =>
    gh == null ? null : agl ? gh - profile.elevation : gh;

/** Likelihood (0..1) that thermal cumulus form below the thermal top. */
const condensationProb = (d: Derived): number => {
    if (!d.lcl || !d.thermalTop) return 0;
    if (d.lcl.gh >= d.thermalTop.gh) return 0; // blue day: parcel stops before saturating
    const margin = d.thermalTop.gh - d.lcl.gh; // depth of the cloud layer
    return Math.max(0, Math.min(1, margin / 600));
};

const maxInversion = (d: Derived): number =>
    d.inversions.length ? Math.max(...d.inversions.map(i => i.strength)) : 0;

export const LAYERS: LayerDef[] = [
    {
        id: 'cloudbase',
        label: 'Cloud base',
        unit: 'm',
        mode: 'diverging',
        domain: 'auto',
        heightBased: true,
        minLabel: 'low',
        maxLabel: 'high',
        value: (p, d, agl) => height(d.lcl?.gh, p, agl),
    },
    {
        id: 'thermaltop',
        label: 'Thermal top',
        unit: 'm',
        mode: 'diverging',
        domain: 'auto',
        heightBased: true,
        minLabel: 'low',
        maxLabel: 'high',
        value: (p, d, agl) => height(d.thermalTop?.gh, p, agl),
    },
    {
        id: 'convection',
        label: 'Thermal activity',
        unit: '0–5',
        mode: 'intensity',
        domain: [0, 5],
        minLabel: 'none',
        maxLabel: 'strong',
        value: (_p, d) => d.thermalStrength,
    },
    {
        id: 'cape',
        label: 'CAPE',
        unit: 'J/kg',
        mode: 'intensity',
        domain: [0, 2500],
        minLabel: '0',
        maxLabel: '2500+',
        value: (_p, d) => d.cape,
    },
    {
        id: 'inversion',
        label: 'Inversion strength',
        unit: '°C',
        mode: 'diverging',
        domain: [0, 8],
        minLabel: 'weak',
        maxLabel: 'strong',
        value: (_p, d) => maxInversion(d),
    },
    {
        id: 'thermalclouds',
        label: 'Thermal clouds',
        unit: 'prob',
        mode: 'cloud',
        domain: [0, 1],
        minLabel: 'blue',
        maxLabel: 'cu likely',
        value: (_p, d) => condensationProb(d),
    },
];

export const layerById = (id: LayerId): LayerDef => LAYERS.find(l => l.id === id) as LayerDef;

// --- colour mapping -----------------------------------------------------------

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** HSL→RGB, h in [0,360), s/l in [0,1]. Returns 0..255 triplet. */
const hsl = (h: number, s: number, l: number): [number, number, number] => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
};

export type RGBA = [number, number, number, number];

/**
 * Map a normalised value t∈[0,1] to RGBA for a given layer mode.
 * `globalAlpha` (0..1) scales the whole layer's opacity.
 */
export const colorize = (mode: LayerMode, t: number, globalAlpha: number): RGBA => {
    const tc = clamp01(t);
    if (mode === 'diverging') {
        const [r, g, b] = hsl(240 * tc, 0.85, 0.5); // 0=red(min) → 240=blue(max)
        return [r, g, b, Math.round(255 * globalAlpha)];
    }
    if (mode === 'intensity') {
        return [255, 60, 50, Math.round(255 * tc * globalAlpha)];
    }
    // cloud
    return [210, 214, 220, Math.round(255 * tc * globalAlpha)];
};

/** CSS gradient string for the legend bar of a layer. */
export const legendGradient = (mode: LayerMode): string => {
    if (mode === 'diverging') {
        const stops = [0, 0.25, 0.5, 0.75, 1].map(t => {
            const [r, g, b] = hsl(240 * t, 0.85, 0.5);
            return `rgb(${r},${g},${b}) ${t * 100}%`;
        });
        return `linear-gradient(90deg, ${stops.join(', ')})`;
    }
    if (mode === 'intensity') {
        return 'linear-gradient(90deg, rgba(255,60,50,0) 0%, rgba(255,60,50,1) 100%)';
    }
    return 'linear-gradient(90deg, rgba(210,214,220,0) 0%, rgba(210,214,220,1) 100%)';
};
