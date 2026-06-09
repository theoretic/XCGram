import type { MeteogramLevels } from '@windy/types.d';

/**
 * Isobaric levels Windy delivers in a meteogram payload, ground-up.
 * `surface` is handled separately (its height is the model elevation).
 */
export const PRESSURE_LEVELS: { key: MeteogramLevels; p: number }[] = [
    { key: '1000h', p: 1000 },
    { key: '950h', p: 950 },
    { key: '925h', p: 925 },
    { key: '900h', p: 900 },
    { key: '850h', p: 850 },
    { key: '800h', p: 800 },
    { key: '700h', p: 700 },
    { key: '600h', p: 600 },
    { key: '500h', p: 500 },
    { key: '400h', p: 400 },
    { key: '300h', p: 300 },
    { key: '200h', p: 200 },
    { key: '150h', p: 150 },
];

// --- Thermodynamic constants (SI) ---
export const KELVIN = 273.15;
export const Rd = 287.04; // J/(kg·K) gas constant, dry air
export const Rv = 461.5; // J/(kg·K) gas constant, water vapour
export const Cp = 1005.7; // J/(kg·K) specific heat, dry air, const pressure
export const Lv = 2.501e6; // J/kg latent heat of vaporisation (0 °C)
export const G = 9.80665; // m/s² standard gravity
export const EPS = Rd / Rv; // 0.622
export const P0 = 1000; // hPa reference pressure for potential temperature

/** Dry adiabatic lapse rate, °C per metre. */
export const DALR = G / Cp; // ≈ 0.0098

export const c2k = (c: number) => c + KELVIN;
export const k2c = (k: number) => k - KELVIN;
