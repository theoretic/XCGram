/**
 * Atmospheric thermodynamics for the XCGram sounding.
 *
 * Everything works in °C / hPa / metres on the input/output boundary and in SI
 * internally where it matters. Formulas follow Bolton (1980) and standard
 * parcel theory; they are accurate enough for forecasting convection, not for
 * publishing a paper.
 */
import { Rd, Cp, EPS, G, KELVIN, P0, c2k } from './levels';
import type { Derived, Inversion, LevelDatum, ParcelPoint, SoundingProfile } from '../types';

/** Saturation vapour pressure (hPa) over water at temperature t (°C). Bolton 1980. */
export const esat = (t: number): number => 6.112 * Math.exp((17.67 * t) / (t + 243.5));

/** Mixing ratio (g/kg) at temperature t (°C) and pressure p (hPa). */
export const mixingRatio = (t: number, p: number): number => {
    const e = esat(t);
    return 1000 * (EPS * e) / (p - e);
};

/** Dew-point (°C) from temperature t (°C) and relative humidity rh (%). */
export const dewpointFromRh = (t: number, rh: number): number => {
    const e = (Math.max(rh, 1) / 100) * esat(t);
    const l = Math.log(e / 6.112);
    return (243.5 * l) / (17.67 - l);
};

/** Potential temperature (K) of a parcel at t (°C), p (hPa). */
export const theta = (t: number, p: number): number => c2k(t) * Math.pow(P0 / p, Rd / Cp);

/** Temperature (°C) of a dry-adiabatic parcel of potential temp th (K) at p (hPa). */
export const tempFromTheta = (th: number, p: number): number =>
    th * Math.pow(p / P0, Rd / Cp) - KELVIN;

/**
 * Lifted condensation level. Returns pressure (hPa) and temperature (°C) of the
 * point where a surface parcel reaches saturation. Bolton (1980) eq. 15 + 22.
 */
export const lcl = (t: number, td: number, p: number): { p: number; t: number } => {
    const tk = c2k(t);
    const tlcl =
        1 / (1 / (c2k(td) - 56) + Math.log(tk / c2k(td)) / 800) + 56; // K
    const plcl = p * Math.pow(tlcl / tk, Cp / Rd);
    return { p: plcl, t: tlcl - KELVIN };
};

/**
 * Moist (pseudo-) adiabatic lapse rate dT/dp in °C/hPa at temperature t (°C),
 * pressure p (hPa). Used to step a saturated parcel upward.
 */
const moistLapseDtDp = (t: number, p: number): number => {
    const tk = c2k(t);
    const r = mixingRatio(t, p) / 1000; // kg/kg
    const Lv = 2.501e6 - 2370 * t; // temperature-dependent latent heat
    const num = Rd * tk + Lv * r;
    const den = Cp + (Lv * Lv * r * EPS) / (Rd * tk * tk);
    // dT/dp = (1/p) * num/den  (hydrostatic + Clausius-Clapeyron)
    return (num / den) / p;
};

/**
 * Lift a surface parcel and return its temperature curve on the same pressure
 * grid as the environment. Dry-adiabatic below the LCL, pseudo-adiabatic above.
 */
export const liftParcel = (
    sfc: LevelDatum,
    pressures: number[],
): ParcelPoint[] => {
    const { p: plcl } = lcl(sfc.t, sfc.td, sfc.p);
    const th = theta(sfc.t, sfc.p);
    const out: ParcelPoint[] = [];

    // Find parcel temp at the LCL by dry adiabat
    let tAtLcl = tempFromTheta(th, plcl);

    for (const p of pressures) {
        if (p >= plcl) {
            out.push({ p, t: tempFromTheta(th, p), gh: NaN });
        } else {
            // Integrate the moist adiabat from the LCL down to this pressure
            let t = tAtLcl;
            let pc = plcl;
            const step = -5; // hPa
            while (pc + step > p) {
                t += moistLapseDtDp(t, pc) * step;
                pc += step;
            }
            t += moistLapseDtDp(t, pc) * (p - pc);
            out.push({ p, t, gh: NaN });
        }
    }
    return out;
};

/** Linear interpolation of a level field against geopotential height. */
const interpByGh = (levels: LevelDatum[], gh: number, pick: (l: LevelDatum) => number): number => {
    for (let i = 0; i < levels.length - 1; i++) {
        const a = levels[i];
        const b = levels[i + 1];
        if ((gh >= a.gh && gh <= b.gh) || (gh <= a.gh && gh >= b.gh)) {
            const f = (gh - a.gh) / (b.gh - a.gh || 1);
            return pick(a) + f * (pick(b) - pick(a));
        }
    }
    return pick(levels[levels.length - 1]);
};

/** Height (m MSL) where the environment temperature crosses a target value. */
const heightOfTemp = (levels: LevelDatum[], target: number): number | null => {
    for (let i = 0; i < levels.length - 1; i++) {
        const a = levels[i];
        const b = levels[i + 1];
        if ((a.t - target) * (b.t - target) <= 0 && a.t !== b.t) {
            const f = (target - a.t) / (b.t - a.t);
            return a.gh + f * (b.gh - a.gh);
        }
    }
    return null;
};

/** Pressure→height lookup on the environment profile. */
const ghOfPressure = (levels: LevelDatum[], p: number): number => {
    for (let i = 0; i < levels.length - 1; i++) {
        const a = levels[i];
        const b = levels[i + 1];
        if ((p <= a.p && p >= b.p) || (p >= a.p && p <= b.p)) {
            const f = (Math.log(p) - Math.log(a.p)) / (Math.log(b.p) - Math.log(a.p) || 1);
            return a.gh + f * (b.gh - a.gh);
        }
    }
    return levels[levels.length - 1].gh;
};

/** Detect low-level inversions (temperature rising with height) up to ~4 km. */
const findInversions = (levels: LevelDatum[]): Inversion[] => {
    const inv: Inversion[] = [];
    for (let i = 0; i < levels.length - 1; i++) {
        const a = levels[i];
        const b = levels[i + 1];
        if (b.gh - a.gh > 4000) break;
        if (b.t > a.t + 0.1) {
            inv.push({ baseGh: a.gh, topGh: b.gh, strength: b.t - a.t });
        }
    }
    return inv;
};

/**
 * Compute all derived, pilot-facing quantities from a profile.
 */
export const derive = (profile: SoundingProfile): Derived => {
    const levels = profile.levels;
    const sfc = levels[0];
    const pressures = levels.map(l => l.p);
    const parcel = liftParcel(sfc, pressures);

    // attach heights to parcel points from the environment grid
    parcel.forEach((pp, i) => (pp.gh = levels[i].gh));

    // LCL (cloud base)
    const lclPt = lcl(sfc.t, sfc.td, sfc.p);
    const lclGh = ghOfPressure(levels, lclPt.p);

    // CAPE / CIN by integrating buoyancy of the parcel vs environment
    let cape = 0;
    let cin = 0;
    let elGh: number | null = null;
    let lfcReached = false;
    for (let i = 0; i < levels.length - 1; i++) {
        const dz = levels[i + 1].gh - levels[i].gh;
        const tvP = (parcel[i].t + parcel[i + 1].t) / 2;
        const tvE = (levels[i].t + levels[i + 1].t) / 2;
        const b = (G * (tvP - tvE)) / c2k(tvE); // buoyant acceleration
        const contrib = b * dz;
        if (tvP > tvE) {
            cape += contrib;
            lfcReached = true;
            elGh = levels[i + 1].gh;
        } else if (!lfcReached) {
            cin += contrib;
        }
    }

    // Thermal top = highest level where surface parcel is still warmer than env
    let thermalTop: Derived['thermalTop'] = null;
    for (let i = levels.length - 1; i >= 0; i--) {
        if (parcel[i].t >= levels[i].t) {
            thermalTop = { p: levels[i].p, gh: levels[i].gh, t: levels[i].t };
            break;
        }
    }

    // Trigger temp: surface temp whose dry adiabat just reaches the inversion/EL
    let triggerTemp: number | null = null;
    if (thermalTop) {
        const thNeeded = theta(thermalTop.t, thermalTop.p);
        triggerTemp = tempFromTheta(thNeeded, sfc.p);
    }

    // Convective condensation level — where surface mixing ratio line meets env T
    const w = mixingRatio(sfc.td, sfc.p);
    let ccl: Derived['ccl'] = null;
    for (let i = 0; i < levels.length; i++) {
        const tdSat = dewpointAtMixingRatio(w, levels[i].p);
        if (levels[i].t <= tdSat) {
            ccl = { p: levels[i].p, gh: levels[i].gh, t: levels[i].t };
            break;
        }
    }

    const freezingLevel = heightOfTemp(levels, 0);

    // Boundary-layer mean wind (surface → thermal top)
    const topGh = thermalTop ? thermalTop.gh : sfc.gh + 1500;
    const bl = levels.filter(l => l.gh <= topGh);
    let blWind: Derived['blWind'] = null;
    if (bl.length) {
        const mu = bl.reduce((s, l) => s + l.u, 0) / bl.length;
        const mv = bl.reduce((s, l) => s + l.v, 0) / bl.length;
        blWind = { speed: Math.hypot(mu, mv), dir: windDir(mu, mv) };
    }

    // Bulk shear surface → 3 km
    const u3 = interpByGh(levels, sfc.gh + 3000, l => l.u);
    const v3 = interpByGh(levels, sfc.gh + 3000, l => l.v);
    const shear03 = Math.hypot(u3 - sfc.u, v3 - sfc.v);

    const inversions = findInversions(levels);

    // Crude 0..5 thermal strength from CAPE + boundary-layer depth
    const depth = thermalTop ? thermalTop.gh - sfc.gh : 0;
    const thermalStrength = Math.max(
        0,
        Math.min(5, Math.round(cape / 150 + depth / 800)),
    );

    return {
        lcl: { p: lclPt.p, gh: lclGh, t: lclPt.t },
        ccl,
        thermalTop,
        freezingLevel,
        cape: Math.round(cape),
        cin: Math.round(cin),
        triggerTemp,
        inversions,
        blWind,
        shear03,
        thermalStrength,
    };
};

/** Dew-point (°C) that corresponds to mixing ratio w (g/kg) at pressure p (hPa). */
const dewpointAtMixingRatio = (w: number, p: number): number => {
    const e = (w / 1000 * p) / (EPS + w / 1000);
    const l = Math.log(e / 6.112);
    return (243.5 * l) / (17.67 - l);
};

/** Meteorological wind direction (deg, FROM) from u/v components. */
export const windDir = (u: number, v: number): number =>
    (270 - (Math.atan2(v, u) * 180) / Math.PI) % 360;

export const windSpeed = (u: number, v: number): number => Math.hypot(u, v);
