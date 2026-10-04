import type { CléDict, ValeurDict } from './fr';

// Dictionnaire ANGLAIS — la complétude est prouvée PAR LE TYPE : l'annotation
// Record<CléDict, ValeurDict> fait échouer `npx tsc --noEmit` s'il manque une clé
// de fr.ts ou si une clé inconnue apparaît (excess property check sur le littéral).
export const en: Record<CléDict, ValeurDict> = {
  'auth.titreLogin': 'Good evening!',
  'auth.titreRegister': 'Create an account',
  'auth.pseudo': 'Username',
  'auth.codeSecret': 'Secret code — 4 digits',
  'auth.codeSecretLabel': 'Secret code',
  'auth.avatarChoix': 'Pick your avatar — changeable in your profile',
  'auth.avatarGroupe': 'Pick your avatar',
  'auth.avatarUn': ({ s }: Record<string, string | number>) => `Avatar ${s}`,
  'auth.chiffre': ({ n }: Record<string, string | number>) => `Digit ${n}`,
  'auth.entrer': 'Enter',
  'auth.creer': 'Create my account',
  'auth.faq': '❓ FAQ',
  'auth.lienLogin': 'No account yet? Create one',
  'auth.lienRegister': 'Already have an account? Enter',
  'auth.errPseudo': 'Username: 3 to 20 characters (letters, numbers, _ -)',
  'auth.errCode': 'Secret code: 4 digits',
  'auth.errEmoji': 'Invalid emoji',
  'auth.errPseudoPris': 'Username already taken',
  'auth.errIdentifiants': 'Incorrect credentials',
  'ludotheque.nbJeux': ({ n }: Record<string, string | number>) => `${n} game${Number(n) > 1 ? 's' : ''}`,
};
