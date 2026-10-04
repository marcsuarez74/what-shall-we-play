'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { t as traduire, type CléDict, type Lang } from '@/lib/i18n';

// Contexte i18n client : le layout serveur lit le cookie (getLang) et alimente
// le provider — les composants clients consomment via useI18n().
type I18n = {
  lang: Lang;
  t: (clé: CléDict, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18n | null>(null);

export function LanguageProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return (
    <I18nContext.Provider value={{ lang, t: (clé, vars) => traduire(lang, clé, vars) }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n doit être utilisé sous <LanguageProvider>');
  return ctx;
}
