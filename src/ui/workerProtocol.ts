import type {
  CorridorDemand,
  CorridorId,
  CorridorModel,
  DemandPresetId,
  Scenario,
  SegmentLiveStats,
  SimAggregates,
} from '@/types';

/** Messages INTO the sim worker. */
export type WorkerIn =
  | {
      type: 'init';
      role: 'live' | 'batch';
      models: CorridorModel[];
      demand: CorridorDemand[];
    }
  | {
      type: 'run'; // batch role: fast 24h run
      jobId: number;
      corridorId: CorridorId;
      preset: DemandPresetId;
      scenario: Scenario;
      seed: number;
      hours: number;
    }
  | { type: 'cancelAll' } // batch role: drop queued jobs
  | {
      type: 'focus'; // live role: (re)start the animated sim
      corridorId: CorridorId;
      preset: DemandPresetId;
      scenario: Scenario;
      seed: number;
      startHour: number;
      speed: number; // sim seconds per wall second
    }
  | { type: 'setSpeed'; speed: number }
  | { type: 'pause' }
  | { type: 'resume' };

/** Messages OUT of the sim worker. */
export type WorkerOut =
  | { type: 'ready'; role: 'live' | 'batch' }
  | {
      type: 'result';
      jobId: number;
      corridorId: CorridorId;
      preset: DemandPresetId;
      scenarioHash: string;
      aggregates: SimAggregates;
      wallMs: number;
    }
  | { type: 'progress'; jobId: number; fraction: number }
  | {
      type: 'frame';
      corridorId: CorridorId;
      timeS: number;
      count: number;
      offsetM: Float32Array;
      lane: Uint8Array;
      dir: Uint8Array;
      speedMs: Float32Array;
      isTruck: Uint8Array;
    }
  | { type: 'liveStats'; corridorId: CorridorId; timeS: number; stats: SegmentLiveStats[] }
  | { type: 'error'; message: string };
