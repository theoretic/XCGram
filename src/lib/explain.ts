/**
 * Turns the numeric Derived indices into pilot-facing explanatory cards.
 * This is the "detailed explanatory data" layer: every number is paired with
 * what it means and why a free-flight / XC pilot should care.
 */
import type { Derived, SoundingProfile } from '../types';
import { windDir, windSpeed } from './thermo';

export type Severity = 'good' | 'neutral' | 'warn' | 'bad';

export interface ExplainItem {
    id: string;
    label: string;
    value: string;
    severity: Severity;
    /** What the quantity physically is. */
    what: string;
    /** Why it matters in the air. */
    why: string;
}

const m = (x: number | null | undefined, unit = 'm') =>
    x == null ? '—' : `${Math.round(x).toLocaleString()} ${unit}`;

const compass = (deg: number): string => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
};

export const explain = (profile: SoundingProfile, d: Derived): ExplainItem[] => {
    const sfc = profile.levels[0];
    const items: ExplainItem[] = [];

    // --- Cloud base (LCL) ---
    if (d.lcl) {
        const agl = d.lcl.gh - profile.elevation;
        items.push({
            id: 'lcl',
            label: 'Cumulus cloud base',
            value: `${m(d.lcl.gh)} MSL · ${m(agl)} AGL`,
            severity: agl > 800 ? 'good' : agl > 300 ? 'neutral' : 'warn',
            what:
                'The Lifting Condensation Level — the height a sun-warmed surface parcel must rise to before its moisture condenses into a cumulus cloud.',
            why:
                'This is the working ceiling of your thermals when cumulus form. Higher base = longer climbs and more glide. A very low base means flat, weak, or over-developing conditions.',
        });
    }

    // --- Thermal top ---
    if (d.thermalTop) {
        const agl = d.thermalTop.gh - profile.elevation;
        items.push({
            id: 'top',
            label: 'Thermal top',
            value: `${m(d.thermalTop.gh)} MSL · ${m(agl)} AGL`,
            severity: agl > 1500 ? 'good' : agl > 600 ? 'neutral' : 'warn',
            what:
                'The Equilibrium Level for a surface parcel — where rising air finally cools to the temperature of its surroundings and stops climbing.',
            why:
                'On blue (cloudless) days this is your hard ceiling. If it sits just under an inversion, expect a sharp top-out; a high top promises big climbs.',
        });
    }

    // --- CAPE ---
    items.push({
        id: 'cape',
        label: 'CAPE',
        value: `${d.cape} J/kg`,
        severity: d.cape > 1500 ? 'bad' : d.cape > 500 ? 'warn' : d.cape > 100 ? 'good' : 'neutral',
        what:
            'Convective Available Potential Energy — the total buoyant energy available to a rising parcel above the level of free convection.',
        why:
            'A little (100–500) means punchy, usable thermals. A lot (>1500) flags strong, possibly explosive convection: gust fronts, over-development and storms. Near zero means weak or no thermals.',
    });

    // --- CIN ---
    if (d.cin < -5) {
        items.push({
            id: 'cin',
            label: 'Convective inhibition (CIN)',
            value: `${d.cin} J/kg`,
            severity: d.cin < -100 ? 'warn' : 'neutral',
            what:
                'A stable "lid" of negative buoyancy near the surface that a parcel must punch through before it can rise freely.',
            why:
                'Strong CIN delays the start of thermals and can suppress them entirely until the ground heats enough. Once broken late in the day it can release sudden, strong convection.',
        });
    }

    // --- Trigger temperature ---
    if (d.triggerTemp != null) {
        const reached = sfc.t >= d.triggerTemp;
        items.push({
            id: 'trigger',
            label: 'Trigger temperature',
            value: `${d.triggerTemp.toFixed(1)} °C (now ${sfc.t.toFixed(1)} °C)`,
            severity: reached ? 'good' : 'neutral',
            what:
                'The surface temperature the ground must reach for a parcel to rise freely to the thermal top.',
            why: reached
                ? 'Already reached — thermals should be triggering. Expect lift across sun-facing slopes.'
                : 'Not yet reached — the air is still capped. Thermals should switch on once the surface warms to this value.',
        });
    }

    // --- Freezing level ---
    items.push({
        id: 'fl',
        label: 'Freezing level',
        value: m(d.freezingLevel),
        severity: 'neutral',
        what: 'Height of the 0 °C isotherm above sea level.',
        why:
            'Sets the snow line and the risk of icing or graupel in strong climbs. Useful for dressing warm and judging cloud-suck danger high up.',
    });

    // --- Inversions ---
    if (d.inversions.length) {
        const strongest = d.inversions.reduce((a, b) => (b.strength > a.strength ? b : a));
        items.push({
            id: 'inv',
            label: 'Inversion',
            value: `base ${m(strongest.baseGh)} · +${strongest.strength.toFixed(1)} °C`,
            severity: strongest.strength > 3 ? 'warn' : 'neutral',
            what:
                'A layer where temperature rises with height instead of falling — a stable cap that resists vertical motion.',
            why:
                'Thermals slow or stop at the inversion base. It traps haze and can hold the day down. A strong morning inversion that lingers means a late or weak start.',
        });
    }

    // --- Boundary-layer wind ---
    if (d.blWind) {
        const dir = compass(d.blWind.dir);
        const kmh = d.blWind.speed * 3.6;
        items.push({
            id: 'blwind',
            label: 'Thermal-layer wind',
            value: `${dir} ${Math.round(kmh)} km/h`,
            severity: kmh > 30 ? 'bad' : kmh > 20 ? 'warn' : 'good',
            what: 'Average wind through the depth your thermals occupy.',
            why:
                'Drives drift and how broken the lift feels. Light wind = stacked, smooth thermals. Above ~25–30 km/h thermals tilt, fragment and break off downwind.',
        });
    }

    // --- Wind shear ---
    if (d.shear03 != null) {
        const kmh = d.shear03 * 3.6;
        items.push({
            id: 'shear',
            label: 'Wind shear (0–3 km)',
            value: `${Math.round(kmh)} km/h`,
            severity: kmh > 40 ? 'bad' : kmh > 25 ? 'warn' : 'good',
            what: 'Change in wind vector between the surface and 3 km.',
            why:
                'High shear tilts and rips thermals apart and raises turbulence and collapse risk. Combined with high CAPE it is the classic storm-organising ingredient.',
        });
    }

    return items;
};
