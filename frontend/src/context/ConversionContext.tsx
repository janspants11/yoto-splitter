import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ConversionContextValue {
  isConverting: boolean;
  setConverting: (v: boolean) => void;
}

const ConversionContext = createContext<ConversionContextValue>({
  isConverting: false,
  setConverting: () => {},
});

export function ConversionProvider({ children }: { children: ReactNode }) {
  const [isConverting, setConverting] = useState(false);
  const set = useCallback((v: boolean) => setConverting(v), []);
  return (
    <ConversionContext.Provider value={{ isConverting, setConverting: set }}>
      {children}
    </ConversionContext.Provider>
  );
}

export function useConversionState() {
  return useContext(ConversionContext);
}
