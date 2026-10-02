// lib/bugs.ts — le relais de signalement : validation, quota, corps markdown,
// ouverture de l'issue via l'API GitHub. Le jeton vit côté serveur uniquement ;
// les env se lisent DANS createBugReport (pas au module) pour rester testables.
import { getDb } from './db';
import pkg from '../package.json';

export type BugType = 'bug' | 'amelioration';
export type BugResult =
  | { ok: true; issueUrl: string; issueNumber: number }
  | { error: string; status: number };
export type BugInput = {
  userId: number; pseudo: string; type: BugType;
  title: string; description: string; page: string;
  device: { appareil: string; navigateur: string; ecran: string; langue: string; installation: string };
  uaBrut: string; captureName?: string | null;
};

const LABELS: Record<BugType, string> = { bug: 'bug', amelioration: 'amélioration' };
const PREFIXES: Record<BugType, string> = { bug: '[Bug] ', amelioration: '[Amélioration] ' };
const QUOTA_JOUR = 3;

export function validerSignalement(input: { title: string; description: string; type: string }): { error: string; status: number } | null {
  const titre = input.title.trim();
  if (titre.length < 3 || titre.length > 120) return { error: 'Titre : entre 3 et 120 caractères', status: 400 };
  const desc = input.description.trim();
  if (desc.length < 10 || desc.length > 4000) return { error: 'Description : entre 10 et 4000 caractères', status: 400 };
  if (input.type !== 'bug' && input.type !== 'amelioration') return { error: 'Type de signalement inconnu', status: 400 };
  return null;
}

const deux = (n: number) => String(n).padStart(2, '0');
function maintenant(): string {
  const d = new Date();
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} à ${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

export type CorpsInput = {
  type: BugType; description: string; page: string; version: string;
  appareil: string; navigateur: string; ecran: string; langue: string; installation: string;
  uaBrut: string; pseudo: string; captureUrl?: string | null;
};

export function corpsIssue(input: CorpsInput): string {
  const lignes: string[] = [
    '## Description',
    '',
    input.description.trim(),
    '',
    '## Contexte',
    `- Page : \`${input.page}\` · app \`v${input.version}\``,
    `- Appareil : ${input.appareil} · ${input.navigateur} · écran ${input.ecran}`,
    `- Langue : ${input.langue} · ${input.installation}`,
    `- Signalé par **${input.pseudo}** le ${maintenant()}`,
  ];
  if (input.captureUrl) lignes.push('', `![capture](${input.captureUrl})`);
  lignes.push('', '<details><summary>User-Agent brut</summary>', '', input.uaBrut, '', '</details>');
  return lignes.join('\n');
}

export async function createBugReport(input: BugInput): Promise<BugResult> {
  const invalide = validerSignalement({ title: input.title, description: input.description, type: input.type });
  if (invalide) return invalide;

  const db = getDb();
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM bug_reports WHERE user_id = ? AND date(created_at) = date('now','localtime')`)
    .get(input.userId) as { total: number };
  if (total >= QUOTA_JOUR) return { error: 'Tu as déjà envoyé 3 signalements aujourd\u2019hui — à demain !', status: 429 };

  const token = process.env.GITHUB_BUG_TOKEN;
  if (!token) return { error: 'Signalement indisponible pour le moment — réessaie plus tard', status: 503 };

  const repo = process.env.GITHUB_REPO || 'marcsuarez74/what-shall-we-play';
  const api = process.env.GITHUB_API || 'https://api.github.com';
  const host = process.env.PUBLIC_URL || 'https://etagere.marc-suarez.fr';
  const body = corpsIssue({
    type: input.type, description: input.description, page: input.page, version: pkg.version,
    appareil: input.device.appareil || 'inconnu', navigateur: input.device.navigateur || 'inconnu',
    ecran: input.device.ecran || 'inconnu', langue: input.device.langue || 'fr', installation: input.device.installation || 'navigateur',
    uaBrut: input.uaBrut, pseudo: input.pseudo,
    captureUrl: input.captureName ? `${host}/api/bugs/capture/${input.captureName}` : null,
  });

  let issue: { number: number; html_url: string };
  try {
    const res = await fetch(`${api}/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: `${PREFIXES[input.type]}${input.title.trim()}`, body, labels: [LABELS[input.type]] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Diagnostic VPS : le status suffit (401 = jeton mal scopé, risque prod n°1) —
      // jamais le corps de la réponse, jamais le jeton.
      console.error(`bugs: GitHub status ${res.status}`);
      return { error: 'GitHub n\u2019a pas répondu — ton signalement n\u2019est pas perdu, réessaie', status: 502 };
    }
    issue = (await res.json()) as { number: number; html_url: string };
  } catch (error) {
    console.error('bugs: GitHub réseau', error);
    return { error: 'GitHub n\u2019a pas répondu — ton signalement n\u2019est pas perdu, réessaie', status: 502 };
  }
  // Le quota ne compte que les signalements qui ont DÉBOUCHÉ sur une issue.
  db.prepare('INSERT INTO bug_reports (user_id, type, titre, issue_url, capture_name) VALUES (?, ?, ?, ?, ?)')
    .run(input.userId, input.type, input.title.trim(), issue.html_url, input.captureName ?? null);
  return { ok: true, issueUrl: issue.html_url, issueNumber: issue.number };
}
