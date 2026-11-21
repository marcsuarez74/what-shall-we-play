import { describe, it, expect, vi, beforeEach } from 'vitest';

// v4.23.0 — import en tâche de fond : BGG et les notifications sont simulés.
const FICHES: Record<number, { title: string; designer: string | null }> = {
  1: { title: 'Gloomhaven', designer: 'Isaac Childres' },
  2: { title: 'Splendor', designer: 'Marc André' },
  3: { title: 'Splendor', designer: 'Autre' },
  4: { title: 'Wingspan', designer: null },
};
const RECHERCHE: Record<string, { bggId: number; name: string; annee: number | null }[]> = {
  Gloomhaven: [{ bggId: 1, name: 'Gloomhaven', annee: 2017 }],
  Splendor: [{ bggId: 2, name: 'Splendor', annee: 2014 }, { bggId: 3, name: 'Splendor', annee: 2024 }],
  Wingspan: [{ bggId: 4, name: 'Wingspan', annee: 2019 }],
};
const fiche = (id: number) => ({
  bggId: id, title: FICHES[id].title, year: 2017, publisher: 'Éd', minPlayers: 2, maxPlayers: 4, playtimeMin: 60,
  weight: 2, rating: 8, designer: FICHES[id].designer, artist: null, bestPlayers: 3, imageUrl: null, coverName: null,
});
vi.mock('@/lib/bgg', () => ({
  searchBoardgames: vi.fn(async (q: string) => RECHERCHE[q] ?? []),
  getThing: vi.fn(async (id: number) => fiche(id)),
  getThings: vi.fn(async (ids: number[]) => ids.map(fiche)),
  attachCover: vi.fn(async (t: unknown) => t),
}));
const notifier = vi.fn(async () => {});
vi.mock('@/lib/push', () => ({ notifier: (...a: unknown[]) => (notifier as (...x: unknown[]) => Promise<void>)(...a) }));

const { creerImport, lireImport, resumeImport, deciderLigne, lancerAjout, reglerImport, abandonnerImport, reprendreImports } = await import('@/lib/import-fond');
const { registerUser } = await import('@/lib/auth');
const { listUserLibrary, createGame } = await import('@/lib/games');
const { getDb } = await import('@/lib/db');

const ligne = (titre: string, o: Record<string, unknown> = {}) => ({
  titre, annee: null, extension: false, minJoueurs: null, maxJoueurs: null, duree: null,
  editeur: null, auteurs: null, illustrateurs: null, ...o,
});
async function attendre(uid: number, statut: string) {
  for (let k = 0; k < 200; k++) {
    if (resumeImport(uid)?.statut === statut) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`statut ${resumeImport(uid)?.statut} ≠ ${statut}`);
}
let n = 0;
const compte = () => (registerUser(`imf${n++}${Date.now() % 1e5}`, '1234') as { id: number }).id;

describe('import en tâche de fond (v4.23.0)', () => {
  beforeEach(() => notifier.mockClear());

  it('recherche sur le serveur, notifie, puis ajoute la sélection', async () => {
    const uid = compte();
    creerImport(uid, 'collection.json', 'json', [ligne('Gloomhaven'), ligne('Splendor'), ligne('Jeu Inconnu'), ligne('Gloomhaven'), ligne('Extension X', { extension: true })], false, 'moyen');
    await attendre(uid, 'pret');
    const { lignes } = lireImport(uid)!;
    expect(lignes.map((l) => l.etat)).toEqual(['ok', 'multi', 'none', 'doublon', 'att']); // extension non cherchée
    expect(resumeImport(uid)).toMatchObject({ tot: 4, faits: 4, choisir: 1, chercher: 1, aAjouter: 3 });
    expect(notifier).toHaveBeenCalledTimes(1);
    expect(notifier.mock.calls[0]).toContain('import');

    expect(await deciderLigne(uid, 1, { bggId: 3 })).toBe(true);
    expect(await deciderLigne(uid, 2, { coche: false })).toBe(true);
    expect(lancerAjout(uid)).toBe(true);
    await attendre(uid, 'fini');
    const jeux = listUserLibrary(uid);
    expect(jeux.map((g) => [g.title, g.bgg_id, g.box_format])).toEqual(
      expect.arrayContaining([['Gloomhaven', 1, 'moyen'], ['Splendor', 3, 'moyen']]));
    expect(jeux).toHaveLength(2);
    expect(notifier).toHaveBeenCalledTimes(2);
  });

  it('départage les homonymes par les auteurs du fichier', async () => {
    const uid = compte();
    creerImport(uid, 'c.csv', 'csv', [ligne('Splendor', { auteurs: 'Marc André' })], false, 'grand');
    await attendre(uid, 'pret');
    expect(lireImport(uid)!.lignes[0]).toMatchObject({ etat: 'ok', fiche: { bggId: 2 } });
  });

  it('déjà dans la ludothèque / fiche à compléter', async () => {
    const uid = compte();
    createGame(uid, { title: 'Wingspan', box_format: 'moyen' });
    createGame(uid, { title: 'Gloomhaven', box_format: 'grand', bgg_id: 1 });
    creerImport(uid, 'c.csv', 'csv', [ligne('Wingspan'), ligne('Gloomhaven')], false, 'grand');
    expect(lireImport(uid)!.lignes[1].etat).toBe('deja'); // même titre déjà lié : pas cherché
    await attendre(uid, 'pret');
    expect(lireImport(uid)!.lignes[0]).toMatchObject({ etat: 'enrichir' });
    lancerAjout(uid);
    await attendre(uid, 'fini');
    expect(listUserLibrary(uid).find((g) => g.title === 'Wingspan')?.bgg_id).toBe(4);
  });

  it('inclure les extensions relance la recherche ; abandonner efface la liste', async () => {
    const uid = compte();
    creerImport(uid, 'c.csv', 'csv', [ligne('Wingspan'), ligne('Gloomhaven', { extension: true })], false, 'grand');
    await attendre(uid, 'pret');
    reglerImport(uid, { ext: true });
    await attendre(uid, 'pret');
    expect(lireImport(uid)!.lignes[1]).toMatchObject({ etat: 'ok', coche: true });
    abandonnerImport(uid);
    expect(lireImport(uid)).toBeNull();
  });

  it('reprend au démarrage un import resté en recherche', async () => {
    const uid = compte();
    creerImport(uid, 'c.csv', 'csv', [ligne('Wingspan')], false, 'grand');
    await attendre(uid, 'pret');
    const db = getDb();
    db.prepare("UPDATE imports SET statut = 'recherche' WHERE user_id = ?").run(uid);
    db.prepare("UPDATE import_lignes SET etat = 'att' WHERE import_id = (SELECT id FROM imports WHERE user_id = ?)").run(uid);
    reprendreImports();
    await attendre(uid, 'pret');
    expect(lireImport(uid)!.lignes[0].etat).toBe('ok');
  });
});
