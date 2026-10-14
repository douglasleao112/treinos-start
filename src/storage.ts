import type { Exercise, StudioData, Workout } from './types';

export const STORAGE_KEY = 'startfit-workout-studio-v1';
const BACKUP_FORMAT = 'startfit-studio-backup';

export const emptyStudioData = (): StudioData => ({
  version: 1,
  workouts: [],
  customExercises: [],
  exerciseNotesMigrated: true,
  selectedWorkoutId: null,
  updatedAt: new Date().toISOString(),
});

export function hydrateExerciseNotes(workouts: Workout[], exercises: Exercise[]): Workout[] {
  const notesByExerciseId = new Map(
    exercises
      .filter((exercise) => exercise.note?.trim())
      .map((exercise) => [exercise.id, exercise.note!.trim()]),
  );
  if (!notesByExerciseId.size) return workouts;
  return workouts.map((workout) => ({
    ...workout,
    days: workout.days.map((day) => ({
      ...day,
      exercises: day.exercises.map((item) =>
        !item.note && notesByExerciseId.has(item.exerciseId)
          ? { ...item, note: notesByExerciseId.get(item.exerciseId) }
          : item,
      ),
    })),
  }));
}

export function loadStudioData(): StudioData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStudioData();
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value?.workouts)) return emptyStudioData();
    const customExercises = Array.isArray(value.customExercises) ? value.customExercises : [];
    if (value.exerciseNotesMigrated) return { ...value, customExercises };
    return {
      ...value,
      workouts: hydrateExerciseNotes(value.workouts, customExercises),
      customExercises,
      exerciseNotesMigrated: true,
    };
  } catch {
    return emptyStudioData();
  }
}

export function saveStudioData(data: StudioData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
}

export function buildStudioBackup(data: StudioData): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  }, null, 2);
}

export function exportStudioBackup(data: StudioData) {
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  downloadText(
    `startfit-studio-backup-${timestamp}.json`,
    buildStudioBackup(data),
    'application/json;charset=utf-8',
  );
}

export function importStudioBackup(content: string): StudioData {
  const backup = JSON.parse(content);
  const restored = backup?.format === BACKUP_FORMAT ? backup.data : backup;
  if (restored?.version !== 1 || !Array.isArray(restored.workouts) || !Array.isArray(restored.customExercises)) {
    throw new Error('Backup do Studio inválido ou incompleto.');
  }
  const selectedWorkoutId = restored.workouts.some((workout: Workout) => workout.id === restored.selectedWorkoutId)
    ? restored.selectedWorkoutId
    : restored.workouts[0]?.id ?? null;
  return {
    ...restored,
    selectedWorkoutId,
    exerciseNotesMigrated: true,
    updatedAt: new Date().toISOString(),
  } as StudioData;
}

export function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
