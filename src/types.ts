export type Exercise = {
  id: string;
  name: string;
  muscleGroup?: string;
  youtubeId?: string;
  youtubeUrl?: string;
  videoOrientation?: 'auto' | 'vertical' | 'horizontal';
  defaultRestSeconds?: number | null;
  note?: string;
};

export type WorkoutSet = {
  reps: string;
  restSeconds: number;
  prescribedLoad?: string;
};

export type WorkoutExercise = {
  exerciseId: string;
  sets: number;
  reps: string;
  restSeconds: number;
  prescribedLoad?: string;
  note?: string;
  setDetails?: WorkoutSet[];
};

export type WorkoutDay = {
  id: string;
  weekday: number;
  label: string;
  note?: string;
  exercises: WorkoutExercise[];
};

export type Workout = {
  id: string;
  name: string;
  note?: string;
  exercises: WorkoutExercise[];
  days: WorkoutDay[];
  activeWeekdays: number[];
  sequences: unknown[];
  startDate: null;
  endDate: null;
  isTemplate: true;
  createdAt: string;
  updatedAt: string;
};

export type StudioData = {
  version: 1;
  workouts: Workout[];
  selectedWorkoutId: string | null;
  updatedAt: string;
};
