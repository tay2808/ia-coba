import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/** Carga datos cada vez que la pantalla recibe el foco. */
export function useFocusData<T>(loader: () => Promise<T>, initial: T): [T, () => Promise<void>, boolean] {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loader());
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  return [data, reload, loading];
}
