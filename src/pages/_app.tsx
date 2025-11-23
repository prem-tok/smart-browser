import "@/styles/globals.css";
import "@/styles/theme.css";
import "@/styles/animations.css";
import type { AppProps } from "next/app";
import { ConfigProvider, App } from 'antd';
import theme from '@/config/themeConfig';
import '@/lib/i18n';  // Initialize i18n
import { useLanguage } from '@/hooks/useLanguage';
import { useEffect } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { useLayoutStore } from '@/stores/layoutStore';
import i18n from '@/lib/i18n';

export default function MyApp({ Component, pageProps }: AppProps) {
  const { antdLocale } = useLanguage();
  const { setLanguage } = useLanguageStore();
  const { themeMode, setThemeMode } = useLayoutStore();

  // Load saved language from Electron store on mount
  useEffect(() => {
    const loadSavedLanguage = async () => {
      if (typeof window !== 'undefined' && (window as any).api) {
        try {
          const savedLanguage = await (window as any).api.invoke('config:get-language');
          if (savedLanguage) {
            await i18n.changeLanguage(savedLanguage);
            setLanguage(savedLanguage);
            console.log(`[App] Loaded saved language: ${savedLanguage}`);
          }
        } catch (error) {
          console.error('[App] Failed to load saved language:', error);
        }
      }
    };

    loadSavedLanguage();
  }, [setLanguage]);

  // Apply theme mode
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return; // Skip during SSR
    }
    
    const root = document.documentElement;
    if (themeMode === 'dark' || (themeMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.setAttribute('data-theme', 'light');
    }
  }, [themeMode]);

  return (
    <ConfigProvider theme={theme} locale={antdLocale}>
      <App className="h-full">
        <Component {...pageProps} />
      </App>
    </ConfigProvider>
  );
}
