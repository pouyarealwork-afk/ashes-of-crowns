import { en, type I18nKey } from './en';
import { fa } from './fa';
import type { Lang, Text } from '../contracts';

export type { I18nKey };
export const DICTIONARIES: Record<Lang, Record<I18nKey, string>> = { en, fa };

export const LANG_META: Record<Lang, { label: string; dir: 'ltr' | 'rtl'; htmlLang: string }> = {
  en: { label: 'English', dir: 'ltr', htmlLang: 'en' },
  fa: { label: 'فارسی', dir: 'rtl', htmlLang: 'fa' },
};

/** Persian digits U+06F0–U+06F9 (Extended Arabic-Indic), the Iranian standard. */
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export function toPersianDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
}

/**
 * Localisation service. One instance per UI. Holds language + digit preference
 * and provides translation, number/time/date formatting and content-text resolution.
 */
export class I18n {
  lang: Lang = 'en';
  persianDigits = true;

  setLang(lang: Lang): void { this.lang = lang; }
  get dir(): 'ltr' | 'rtl' { return LANG_META[this.lang].dir; }
  get isRtl(): boolean { return this.dir === 'rtl'; }
  private get useFaDigits(): boolean { return this.lang === 'fa' && this.persianDigits; }

  /** Translate a UI key with `{param}` interpolation. Numbers are formatted per language. */
  t(key: I18nKey, params?: Record<string, string | number>): string {
    const raw = DICTIONARIES[this.lang][key] ?? en[key] ?? key;
    if (!params) return this.digits(raw);
    return this.digits(
      raw.replace(/\{(\w+)\}/g, (_, k: string) => {
        const v = params[k];
        return v === undefined ? `{${k}}` : typeof v === 'number' ? this.num(v) : v;
      }),
    );
  }

  /** Resolve content text from other modules (string | {en, fa}). Falls back to English, then any value. */
  text(v: Text | undefined | null): string {
    if (v == null) return '';
    if (typeof v === 'string') return this.digits(v);
    return this.digits(v[this.lang] ?? v.en ?? Object.values(v).find(Boolean) ?? '');
  }

  /** Format a number with grouping and the correct digit set. */
  num(n: number, opts?: Intl.NumberFormatOptions): string {
    const locale = this.useFaDigits ? 'fa-IR' : 'en-US';
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, ...opts }).format(n);
  }

  /** Convert ASCII digits to Persian digits when that preference is active. */
  digits(s: string): string { return this.useFaDigits ? toPersianDigits(s) : s; }

  /** 3723 → "1h 2m" / "۱ ساعت و ۲ دقیقه". */
  duration(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (this.lang === 'fa') {
      const parts: string[] = [];
      if (h) parts.push(`${this.num(h)} ساعت`);
      parts.push(`${this.num(m)} دقیقه`);
      return parts.join(' و ');
    }
    return h ? `${h}h ${m}m` : `${m}m`;
  }

  date(epochMs: number): string {
    const locale = this.lang === 'fa' ? (this.persianDigits ? 'fa-IR' : 'fa-IR-u-nu-latn') : 'en-GB';
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(epochMs);
    } catch {
      return new Date(epochMs).toLocaleString();
    }
  }
}
