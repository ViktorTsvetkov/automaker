"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { FileBrowserDialog } from "@/components/dialogs/file-browser-dialog";

interface FileBrowserContextValue {
  openFileBrowser: () => Promise<string | null>;
}

const FileBrowserContext = createContext<FileBrowserContextValue | null>(null);

export function FileBrowserProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [resolver, setResolver] = useState<((value: string | null) => void) | null>(null);

  const openFileBrowser = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      setIsOpen(true);
      setResolver(() => resolve);
    });
  }, []);

  const handleSelect = useCallback((path: string) => {
    if (resolver) {
      resolver(path);
      setResolver(null);
    }
    setIsOpen(false);
  }, [resolver]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && resolver) {
      resolver(null);
      setResolver(null);
    }
    setIsOpen(open);
  }, [resolver]);

  return (
    <FileBrowserContext.Provider value={{ openFileBrowser }}>
      {children}
      <FileBrowserDialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        onSelect={handleSelect}
      />
    </FileBrowserContext.Provider>
  );
}

export function useFileBrowser() {
  const context = useContext(FileBrowserContext);
  if (!context) {
    throw new Error("useFileBrowser must be used within FileBrowserProvider");
  }
  return context;
}

// Global reference for non-React code (like HttpApiClient)
let globalFileBrowserFn: (() => Promise<string | null>) | null = null;

export function setGlobalFileBrowser(fn: () => Promise<string | null>) {
  globalFileBrowserFn = fn;
}

export function getGlobalFileBrowser() {
  return globalFileBrowserFn;
}
