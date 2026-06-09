import type { Timestamp } from '@windy/types.d';

/** A single isobaric (or surface) level of a vertical profile. */
export interface LevelDatum {
    /** Pressure in hPa. */
    p: number;
    /** Geopotential height above MSL in metres. */
    gh: number;
    /** Air temperature in °C. */
    t: number;
    /** Dew-point temperature in °C. */
    td: number;
    /** Wind components in m/s (meteorological u/v). */
    u: number;
    v: number;
    /** Relative humidity 0..100 (%), if delivered. */
    rh?: number;
}

/** A full vertical profile valid at one forecast timestamp. */
export interface SoundingProfile {
    ts: Timestamp;
    /** Levels ordered from the ground up (highest pressure first). */
    levels: LevelDatum[];
    /** Terrain/model surface elevation in metres. */
    elevation: number;
}

/** Derived, human-meaningful quantities computed from a profile. */
export interface Derived {
    /** Lifted condensation level — the convective cloud base. */
    lcl: { p: number; gh: number; t: number } | null;
    /** Convective condensation level (cloud base reached by surface heating). */
    ccl: { p: number; gh: number; t: number } | null;
    /** Equilibrium level / thermal top — where a surface parcel stops rising. */
    thermalTop: { p: number; gh: number; t: number } | null;
    /** Height of the 0 °C isotherm (MSL, metres). */
    freezingLevel: number | null;
    /** Convective available potential energy, J/kg. */
    cape: number;
    /** Convective inhibition, J/kg (negative or zero). */
    cin: number;
    /** Trigger temperature — surface temp needed to start thermals, °C. */
    triggerTemp: number | null;
    /** Detected low-level temperature inversions. */
    inversions: Inversion[];
    /** Mean wind in the boundary layer (surface→thermal top). */
    blWind: { speed: number; dir: number } | null;
    /** Bulk wind shear surface→3 km, m/s. */
    shear03: number | null;
    /** Qualitative thermal strength estimate, 0..5. */
    thermalStrength: number;
}

export interface Inversion {
    baseGh: number;
    topGh: number;
    /** Temperature increase across the inversion, °C. */
    strength: number;
}

export type ParcelPoint = { p: number; t: number; gh: number };
