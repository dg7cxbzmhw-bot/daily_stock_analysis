import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { formatUiText, UI_TEXT, type UiLanguage, type UiTextKey, type UiTextParams } from '../i18n/uiText';

export const UI_LANGUAGE_STORAGE_KEY = 'dsa.uiLanguage';

type UiLanguageContextValue = {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  t: (key: UiTextKey, params?: UiTextParams) => string;
};

const fallbackContext: UiLanguageContextValue = {
  language: 'zh',
  setLanguage: () => undefined,
  t: (key, params) => formatUiText(UI_TEXT.zh[key], params),
};

const UiLanguageContext = createContext<UiLanguageContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- helper is exported for language resolution tests
export function normalizeUiLanguage(value?: string | null): UiLanguage | null {
  if (value === 'zh' || value === 'en') {
    return value;
  }
  return null;
}

function getStoredUiLanguage(storage?: Storage | null): UiLanguage | null {
  if (!storage) {
    return null;
  }

  try {
    return normalizeUiLanguage(storage.getItem(UI_LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function getBrowserUiLanguage(navigatorLike?: Pick<Navigator, 'language' | 'languages'> | null): UiLanguage {
  const languageCandidates = [
    ...(Array.isArray(navigatorLike?.languages) ? navigatorLike?.languages ?? [] : []),
    navigatorLike?.language,
  ].filter((language): language is string => Boolean(language));

  for (const candidate of languageCandidates) {
    const normalized = candidate.toLowerCase();
    if (normalized.startsWith('zh')) {
      return 'zh';
    }
    if (normalized.startsWith('en')) {
      return 'en';
    }
  }

  return 'zh';
}

// eslint-disable-next-line react-refresh/only-export-components -- helper is exported for deterministic language resolution tests
export function resolveInitialUiLanguage({
  storage,
  navigatorLike,
}: {
  storage?: Storage | null;
  navigatorLike?: Pick<Navigator, 'language' | 'languages'> | null;
} = {}): UiLanguage {
  const stored = getStoredUiLanguage(storage);
  if (stored) {
    return stored;
  }

  return getBrowserUiLanguage(navigatorLike);
}

function getRuntimeInitialLanguage(): UiLanguage {
  if (typeof window === 'undefined') {
    return 'zh';
  }

  return resolveInitialUiLanguage({
    storage: window.localStorage,
    navigatorLike: window.navigator,
  });
}

export const UiLanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<UiLanguage>(getRuntimeInitialLanguage);

  const setLanguage = useCallback((nextLanguage: UiLanguage) => {
    setLanguageState(nextLanguage);
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      // Ignore storage failures; the in-memory language switch still works.
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    }
  }, [language]);

  const value = useMemo<UiLanguageContextValue>(() => ({
    language,
    setLanguage,
    t: (key, params) => formatUiText(UI_TEXT[language][key], params),
  }), [language, setLanguage]);

  return (
    <UiLanguageContext.Provider value={value}>
      {children}
    </UiLanguageContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components -- useUiLanguage is a hook, co-located for context access
export function useUiLanguage(): UiLanguageContextValue {
  return useContext(UiLanguageContext) ?? fallbackContext;
}
