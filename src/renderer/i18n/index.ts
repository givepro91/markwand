// i18next 초기화 — ko (기본) / en 지원.
// 시스템 locale 기반 자동 감지 + prefs 저장 override.
//
// 언어 전환:
//   i18n.changeLanguage('en') 또는 useTranslation().i18n.changeLanguage
// prefs 저장:
//   window.api.prefs.set('language', 'en')
//
// App mount 시점에 prefs 로부터 override 를 1회 로드한다.

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ko from './locales/ko.json'
import en from './locales/en.json'

export type Language = 'ko' | 'en'

function detectInitialLanguage(): Language {
  if (typeof navigator !== 'undefined' && navigator.language) {
    if (navigator.language.toLowerCase().startsWith('ko')) return 'ko'
  }
  return 'en'
}

void i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    en: { translation: en },
  },
  lng: detectInitialLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React 는 자체 escape
  },
  returnNull: false,
})

/** App 진입 시 1회 호출 — prefs 에 저장된 override 를 반영. */
export async function loadLanguageFromPrefs(): Promise<void> {
  try {
    const stored = await window.api.prefs.get('language')
    if (stored === 'ko' || stored === 'en') {
      await i18n.changeLanguage(stored)
    }
  } catch {
    // prefs 접근 실패 — 기본 언어 유지
  }
}

export default i18n
