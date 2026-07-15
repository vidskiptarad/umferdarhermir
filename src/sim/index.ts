/**
 * Public entry point for the Umferð simulation engine.
 * Dependency-free, deterministic, runnable in a Web Worker and under Node.
 */
export { Simulation } from './simulation';
export { applyScenario, freeFlowTime, World } from './world';
export { iidmAccel, accel, equilibriumGap, CAR, TRUCK } from './iidm';
export type { IdmParams } from './iidm';
export { mobilChange, MOBIL } from './mobil';
export {
  shouldStartOvertake,
  gRequiredS,
  overtakeTimeS,
  SIGHT_M,
  MAX_OVERTAKE_M,
} from './overtake';
export { capacityVehPerS, TC_S, TF_S, ZONE_HALF_M } from './junction';
export { Rng } from './rng';
export { percentile, mean, RollingSegStats } from './stats';
