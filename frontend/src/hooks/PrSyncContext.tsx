import { createContext, useContext, type ReactNode } from 'react';
import { usePrSync, type PrSyncApi } from './usePrSync';

const PrSyncContext = createContext<PrSyncApi | null>(null);

export function PrSyncProvider({
  children,
  onCreated,
}: {
  children: ReactNode;
  onCreated: () => Promise<void>;
}) {
  return <PrSyncContext.Provider value={usePrSync({ onCreated })}>{children}</PrSyncContext.Provider>;
}

export function usePrSyncContext(): PrSyncApi {
  const ctx = useContext(PrSyncContext);
  if (!ctx) throw new Error('usePrSyncContext는 PrSyncProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}
