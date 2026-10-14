import type { StudioData } from './types';

export const STORAGE_KEY = 'startfit-workout-studio-v1';

export const emptyStudioData = (): StudioData => ({
  version: 1,
  workouts: [],
  customExercises: [],
  selectedWorkoutId: null,
  updatedAt: new Date().toISOString(),
});

export function loadStudioData(): StudioData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStudioData();
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value?.workouts)) return emptyStudioData();
    return { ...value, customExercises: Array.isArray(value.customExercises) ? value.customExercises : [] };
  } catch {
    return emptyStudioData();
  }
}

export function saveStudioData(data: StudioData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
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
