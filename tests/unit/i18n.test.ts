import { describe, it, expect } from 'vitest';
import { t, DICTS, en, estLangValide, type CléDict, type Lang, type ValeurDict } from '@/lib/i18n';
import { formatDate, formatNombre } from '@/lib/i18n/format';

// Garde PAR LE TYPE : en doit déclarer exactement les clés de fr — clé manquante ou en
// trop = échec `npx tsc --noEmit` (Record<CléDict, ValeurDict> n'accepte ni l'un ni l'autre).
const enComplet: Record<CléDict, ValeurDict> = en;
const dicts: Record<Lang, Record<CléDict, ValeurDict>> = DICTS;
void enComplet;
void dicts;

describe('i18n', () => {
  it('le dict EN est complet (typage) et le repli FR marche', () => {
    expect(t('en', 'auth.creer')).toBe(DICTS.en['auth.creer']);
    expect(DICTS.fr['auth.creer']).toBe('Créer mon compte');
  });
  it('pluriels par fonction, pas par concat', () => {
    expect(t('fr', 'ludotheque.nbJeux', { n: 1 })).toBe('1 jeu');
    expect(t('fr', 'ludotheque.nbJeux', { n: 3 })).toBe('3 jeux');
    expect(t('en', 'ludotheque.nbJeux', { n: 3 })).toBe('3 games');
  });
  it('langue invalide → fr', () => {
    expect(estLangValide('xx')).toBe(false);
  });
});

describe('format', () => {
  it('formatDate/formatNombre suivent la langue', () => {
    // T12:00:00 : midi local → même jour quel que soit le fuseau du poste/CI.
    expect(formatDate('fr', '2026-10-04T12:00:00', { dateStyle: 'long' })).toBe('4 octobre 2026');
    expect(formatDate('en', '2026-10-04T12:00:00', { dateStyle: 'long' })).toBe('4 October 2026');
    expect(formatDate('en', new Date(2026, 9, 4), { dateStyle: 'long' })).toBe('4 October 2026');
    expect(formatNombre('fr', 4.5, { maximumFractionDigits: 1 })).toBe('4,5');
    expect(formatNombre('en', 4.5, { maximumFractionDigits: 1 })).toBe('4.5');
    expect(formatNombre('fr', 12)).toBe('12');
  });
});
