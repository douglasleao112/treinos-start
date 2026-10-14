import type { Exercise } from './types';
import { STARTFIT_EXERCISES } from './catalog-snapshot';

// Snapshot local do catálogo de exercícios do STARTFIT. Assim o colaborador
// monta os treinos sem login, internet ou qualquer credencial do aplicativo.
export const FALLBACK_EXERCISES: Exercise[] = STARTFIT_EXERCISES;

export async function loadExerciseCatalog(_publicAnonKey: string): Promise<Exercise[]> {
  return STARTFIT_EXERCISES;
}
