import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { loadJSON, saveJSON } from '../utils/storage';

export function usePersistedState<T>(
  key: string,
  initialValue: T,
  reviver: (value: T) => T = (value) => value,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => reviver(loadJSON(key, initialValue)));

  useEffect(() => {
    saveJSON(key, value);
  }, [key, value]);

  return [value, setValue];
}
