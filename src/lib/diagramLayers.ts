/**
 * Extra visual layers for the Skew-T diagram: a cloud-development helper and a
 * thermal-activity column. Both are computed from the same SoundingProfile the
 * diagram already holds — no extra fetches.
 */
import { esat } from './thermo';
import type { Derived, LevelDatum, SoundingProfile } from '../types';

// ── Cloud layers ───────────────────────────────────────────────────────────

export interface CloudLayer {
    /** Pressure of the layer base (higher hPa) and top (lower hPa). */
    pBot: number;
    pTop: number;
    /** Mean cloudiness 0..1 — drives circle count and opacity. */
    prob: number;
}

/** Relative humidity 0..100 for a level — uses delivered rh, else t/td. */
const levelRh = (l: LevelDatum): number => {
    if (l.rh != null && !Number.isNaN(l.rh)) return Math.max(0, Math.min(100, l.rh));
    return Math.max(0, Math.min(100, 100 * (esat(l.td) / esat(l.t))));
};

/**
 * Group the profile into contiguous humid bands and rate each one's cloudiness.
 * A band is a run of levels with RH at or above RH_ON; its probability scales
 * from there to saturation. Mirrors the grey cloud helper on the native diagram,
 * but split per layer so multiple cloud decks each get their own bunch.
 */
export const cloudLayers = (profile: SoundingProfile): CloudLayer[] => {
    const RH_ON = 60; // % — below this, treat as cloud-free
    const levels = profile.levels;
    const out: CloudLayer[] = [];

    let run: LevelDatum[] = [];
    const flush = () => {
        if (run.length) {
            const meanRh = run.reduce((s, l) => s + levelRh(l), 0) / run.length;
            const prob = Math.max(0, Math.min(1, (meanRh - RH_ON) / (100 - RH_ON)));
            if (prob > 0.02) {
                out.push({
                    pBot: Math.max(...run.map(l => l.p)),
                    pTop: Math.min(...run.map(l => l.p)),
                    prob,
                });
            }
            run = [];
        }
    };

    for (const l of levels) {
        if (levelRh(l) >= RH_ON) run.push(l);
        else flush();
    }
    flush();
    return out;
};

// ── Thermal-activity column ──────────────────────────────────────────────────

export interface ThermalSeg {
    /** Geopotential heights (m MSL) bounding this 100 m slab. */
    ghBot: number;
    ghTop: number;
    /**
     * Environmental lapse rate normalised to the dry adiabat:
     *   ≥1 dry-adiabatic or steeper (unstable), 0 isothermal, <0 inversion.
     * Drives both bar length and colour.
     */
    tNorm: number;
    /** Raw environmental lapse rate, °C per km (negative = inversion). */
    gamma: number;
}

export interface ThermalColumn {
    segs: ThermalSeg[];
}

const SEG_M = 100; // slab height, metres
const DALR_KM = 9.8; // dry adiabatic lapse rate, °C per km

/** Linear interpolation of the environment temperature (°C) at height gh. */
const interpT = (levels: LevelDatum[], gh: number): number => {
    for (let i = 0; i < levels.length - 1; i++) {
        const a = levels[i];
        const b = levels[i + 1];
        if (gh >= a.gh && gh <= b.gh) {
            const f = (gh - a.gh) / (b.gh - a.gh || 1);
            return a.t + f * (b.t - a.t);
        }
    }
    return levels[levels.length - 1].t;
};

/**
 * Build a 100 m-resolution column of the environmental lapse rate, surface up to
 * the thermal top (or 3 km if none). Each slab reports how steep the temperature
 * gradient is relative to the dry adiabat — a per-height instability signal that,
 * unlike an integrated updraft, does not grow monotonically with altitude.
 */
export const thermalColumn = (profile: SoundingProfile, derived: Derived): ThermalColumn => {
    const levels = profile.levels;
    const sfc = levels[0];
    const topGh = derived.thermalTop ? derived.thermalTop.gh : sfc.gh + 3000;
    const segs: ThermalSeg[] = [];

    for (let gh = sfc.gh; gh + SEG_M <= topGh + 1; gh += SEG_M) {
        const tBot = interpT(levels, gh);
        const tTop = interpT(levels, gh + SEG_M);
        const gamma = ((tBot - tTop) / SEG_M) * 1000; // °C/km, + = cooling upward
        segs.push({ ghBot: gh, ghTop: gh + SEG_M, tNorm: gamma / DALR_KM, gamma });
    }

    return { segs };
};
