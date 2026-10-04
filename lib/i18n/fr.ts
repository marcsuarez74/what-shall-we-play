// Dictionnaire FRANÇAIS — source de vérité des clés (CléDict = keyof typeof fr).
// Clés plates par domaine ; valeurs string ou fonction (pluriels, accords) —
// jamais de concaténation côté appelant. Aucune dépendance i18n externe.
export type ValeurDict = string | ((vars: Record<string, string | number>) => string);

export const fr = {
  // Auth (AuthForm, PinInput) — libellés historiques, identiques sans cookie.
  'auth.titreLogin': 'Bonsoir !',
  'auth.titreRegister': 'Créer un compte',
  'auth.pseudo': 'Pseudo',
  'auth.codeSecret': 'Code secret — 4 chiffres',
  'auth.codeSecretLabel': 'Code secret',
  'auth.avatarChoix': 'Choisis ton avatar — modifiable au profil',
  'auth.avatarGroupe': 'Choisis ton avatar',
  'auth.avatarUn': ({ s }: Record<string, string | number>) => `Avatar ${s}`,
  'auth.chiffre': ({ n }: Record<string, string | number>) => `Chiffre ${n}`,
  'auth.entrer': 'Entrer',
  'auth.creer': 'Créer mon compte',
  'auth.faq': '❓ Questions fréquentes',
  'auth.lienLogin': 'Pas de compte ? Le créer',
  'auth.lienRegister': 'Déjà un compte ? Entrer',
  // Erreurs (lib/auth.ts) — la route les renvoie dans la langue du navigateur.
  'auth.errPseudo': 'Pseudo : 3 à 20 caractères (lettres, chiffres, _ -)',
  'auth.errCode': 'Code secret : 4 chiffres',
  'auth.errEmoji': 'Emoji invalide',
  'auth.errPseudoPris': 'Pseudo déjà pris',
  'auth.errIdentifiants': 'Identifiants incorrects',
  // Pluriel exemplaire (consommé par les zones T2-T6).
  'ludotheque.nbJeux': ({ n }: Record<string, string | number>) => `${n} jeu${Number(n) > 1 ? 'x' : ''}`,
} as const;
export type CléDict = keyof typeof fr;
