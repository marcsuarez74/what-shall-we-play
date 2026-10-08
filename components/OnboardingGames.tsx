'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATS, formatShort } from '@/lib/formats';
import { ficheBggFormData, type FicheBgg } from '@/lib/bgg-ajout';
import { planifierImport, type LigneImport } from '@/lib/import-bgg';
import type { BoxFormat } from '@/lib/types';
import { useI18n } from './LanguageProvider';
import Etapes from './Etapes';

interface Suggestion { bggId: number; name: string; annee: number | null; }
// Un jeu créé pendant cet écran : seuls ceux-là sont listés (et retirables).
interface Ajoute { id: number; titre: string; bggId: number | null; format: BoxFormat; coverName: string | null; }
type Onglet = 'rech' | 'bgg' | 'main';
type EtapeBgg = 'pseudo' | 'apercu' | 'fini';

const DEBOUNCE_MS = 500;
const MAX_SUGGESTIONS = 8;
const CYCLE: Record<BoxFormat, BoxFormat> = { mini: 'petit', petit: 'moyen', moyen: 'grand', grand: 'mini' };

export default function OnboardingGames({ pseudo, next }: { pseudo: string; next?: string }) {
  const router = useRouter();
  const { lang, t } = useI18n();
  const [onglet, setOnglet] = useState<Onglet>('rech');
  const [jeux, setJeux] = useState<Ajoute[]>([]);
  const [toast, setToast] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Rechercher
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [enCours, setEnCours] = useState<number | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Collection BGG
  const [etapeBgg, setEtapeBgg] = useState<EtapeBgg>('pseudo');
  const [pseudoBgg, setPseudoBgg] = useState('');
  const [lignes, setLignes] = useState<LigneImport[]>([]);
  const [progres, setProgres] = useState<{ i: number; n: number } | null>(null);
  // À la main (le format sert aussi de format par défaut de l'import)
  const [titre, setTitre] = useState('');
  const [format, setFormat] = useState<BoxFormat>('grand');
  const [busy, setBusy] = useState(false);

  const neufs = lignes.filter((l) => l.etat === 'nouveau');

  function changerOnglet(o: Onglet) { setOnglet(o); setToast(''); setError(null); }

  async function erreurApi(res: Response, defaut: string) {
    return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? defaut;
  }

  async function chercher(v: string) {
    try {
      const res = await fetch(`/api/bgg/search?q=${encodeURIComponent(v)}`);
      if (!res.ok) throw new Error();
      setSuggestions(((await res.json()).results as Suggestion[]).slice(0, MAX_SUGGESTIONS));
    } catch { setSuggestions([]); setError(t('ajout.errBggToken')); }
  }

  function onQ(v: string) {
    setQ(v); setSuggestions(null); setError(null);
    if (debounce.current) clearTimeout(debounce.current);
    if (v.trim().length >= 2) debounce.current = setTimeout(() => { void chercher(v.trim()); }, DEBOUNCE_MS);
  }

  async function creerDepuisBgg(bggId: number, secours: string, f: BoxFormat): Promise<Ajoute> {
    const res = await fetch(`/api/bgg/thing?id=${bggId}`);
    if (!res.ok) throw new Error(t('ajout.errFicheBgg'));
    const fiche = (await res.json()) as FicheBgg;
    const r = await fetch('/api/games', { method: 'POST', body: ficheBggFormData(fiche, f, fiche.title || secours) });
    if (!r.ok) throw new Error(await erreurApi(r, t('ajout.errEnregistrement')));
    const { id } = (await r.json()) as { id: number };
    return { id, titre: fiche.title || secours, bggId, format: f, coverName: fiche.coverName };
  }

  async function ajouterSuggestion(s: Suggestion) {
    if (enCours != null || jeux.some((j) => j.bggId === s.bggId)) return;
    setEnCours(s.bggId); setError(null);
    try {
      const j = await creerDepuisBgg(s.bggId, s.name, 'grand');
      setJeux((prev) => [j, ...prev]);
      setToast(t('bienvenue.toastAjoute', { j: j.titre }));
    } catch (e) { setError((e as Error).message); } finally { setEnCours(null); }
  }

  async function voirCollection() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/bgg/collection?username=${encodeURIComponent(pseudoBgg.trim())}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? t('bgg.errPasReponse')); return; }
      const coll = (data.jeux ?? []) as LigneImport['jeu'][];
      if (coll.length === 0) { setError(t('import.errAucunPossede')); return; }
      const res2 = await fetch('/api/games');
      if (!res2.ok) { setError(t('import.errLectureLudo')); return; }
      const ludo = ((await res2.json()).games ?? []) as Parameters<typeof planifierImport>[1];
      // Seuls les jeux absents de la ludothèque sont importés : rien n'est écrasé.
      setLignes(planifierImport(coll, ludo));
      setEtapeBgg('apercu');
    } catch { setError(t('bgg.errPasReponse')); } finally { setBusy(false); }
  }

  async function importer() {
    setBusy(true); setError(null); setToast('');
    let ok = 0, ko = 0;
    for (const [i, l] of neufs.entries()) {
      setProgres({ i: i + 1, n: neufs.length });
      try {
        const j = await creerDepuisBgg(l.jeu.bggId, l.jeu.titre, format);
        setJeux((prev) => [j, ...prev]); ok++;
      } catch { ko++; }
    }
    setProgres(null); setBusy(false); setEtapeBgg('fini');
    setToast(t('bienvenue.toastImportes', { n: ok, k: ko }));
  }

  async function ajouterManuel() {
    const tt = titre.trim();
    if (!tt) return;
    setBusy(true); setError(null);
    const fd = new FormData();
    fd.append('title', tt);
    fd.append('box_format', format);
    const res = await fetch('/api/games', { method: 'POST', body: fd });
    setBusy(false);
    if (!res.ok) { setError(await erreurApi(res, t('ajout.errEnregistrement'))); return; }
    const { id } = (await res.json()) as { id: number };
    setJeux((prev) => [{ id, titre: tt, bggId: null, format, coverName: null }, ...prev]);
    setTitre('');
    setToast(t('bienvenue.toastAjoute', { j: tt }));
  }

  async function changerFormat(j: Ajoute) {
    const f = CYCLE[j.format];
    const res = await fetch(`/api/games/${j.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ box_format: f }),
    });
    if (!res.ok) { setError(await erreurApi(res, t('ajout.errEnregistrement'))); return; }
    setJeux((prev) => prev.map((x) => (x.id === j.id ? { ...x, format: f } : x)));
  }

  async function retirer(j: Ajoute) {
    const res = await fetch(`/api/games/${j.id}`, { method: 'DELETE' });
    if (!res.ok) { setError(await erreurApi(res, t('ajout.errEnregistrement'))); return; }
    setJeux((prev) => prev.filter((x) => x.id !== j.id));
    setToast(t('bienvenue.toastRetire', { j: j.titre }));
  }

  function terminer() {
    router.push(next ?? '/library?bienvenue=1');
  }

  const choixFormat = (
    <div className="onb-formats" role="group" aria-label={t('ajout.fmtBoite')}>
      {FORMATS.map((f) => (
        <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}>
          {formatShort(f, lang)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="onb">
      <p className="onb-marque">What Shall We Play?</p>
      <Etapes n={2} />
      <h1 className="onb-titre">{t('bienvenue.titre', { p: pseudo })}</h1>
      <p className="onb-sous">{t('bienvenue.sous')}</p>

      <div className="onb-seg" role="group" aria-label={t('bienvenue.ongletsAria')}>
        {([['rech', 'bienvenue.ongletRecherche'], ['bgg', 'bienvenue.ongletBgg'], ['main', 'bienvenue.ongletMain']] as const).map(([k, cle]) => (
          <button key={k} type="button" aria-pressed={onglet === k} onClick={() => changerOnglet(k)}>{t(cle)}</button>
        ))}
      </div>

      {onglet === 'rech' && (
        <>
          <input className="onb-input" value={q} onChange={(e) => onQ(e.target.value)} autoComplete="off"
                 placeholder={t('bienvenue.rechPlaceholder')} aria-label={t('bienvenue.rechAria')} />
          {suggestions && suggestions.length > 0 && (
            <div className="onb-suggs">
              {suggestions.map((s) => {
                const deja = jeux.some((j) => j.bggId === s.bggId);
                return (
                  <button key={s.bggId} type="button" className={`onb-sugg${deja ? ' deja' : ''}`}
                          disabled={deja || enCours != null} onClick={() => ajouterSuggestion(s)}>
                    <span className="onb-t">{s.name}{s.annee && <small>{s.annee}</small>}</span>
                    <span className="onb-plus">{deja ? t('bienvenue.ajoute') : enCours === s.bggId ? '…' : t('bienvenue.ajouter')}</span>
                  </button>
                );
              })}
            </div>
          )}
          {suggestions && suggestions.length === 0 && !error && <p className="onb-sous">{t('bienvenue.aucunTrouve')}</p>}
        </>
      )}

      {onglet === 'bgg' && (
        <div className="onb-carte">
          {etapeBgg === 'pseudo' && (
            <>
              <p>{t('bienvenue.bggIntro')}</p>
              <label htmlFor="onb-bgg">{t('import.pseudoLabel')}</label>
              <input id="onb-bgg" className="onb-input" value={pseudoBgg} autoComplete="off"
                     onChange={(e) => setPseudoBgg(e.target.value)} placeholder={t('import.pseudoExemple')} />
              <button type="button" className="btn-copper onb-sm" disabled={busy || !pseudoBgg.trim()} onClick={voirCollection}>
                {busy ? t('import.preparation') : t('bienvenue.bggVoir')}
              </button>
            </>
          )}
          {etapeBgg === 'apercu' && (
            <>
              <p>{t('bienvenue.bggApercu', { n: lignes.length, p: pseudoBgg.trim(), d: lignes.length - neufs.length })}</p>
              <span className="onb-label">{t('bienvenue.fmtDefaut')}</span>
              {choixFormat}
              <button type="button" className="btn-copper onb-sm" disabled={busy || neufs.length === 0} onClick={importer}>
                {progres ? t('bienvenue.importEnCours', progres) : t('import.importerN', { n: neufs.length })}
              </button>
              {!busy && (
                <button type="button" className="onb-lien" onClick={() => { setEtapeBgg('pseudo'); setLignes([]); }}>
                  {t('bienvenue.changerPseudo')}
                </button>
              )}
            </>
          )}
          {etapeBgg === 'fini' && <p>{t('bienvenue.bggFini')}</p>}
        </div>
      )}

      {onglet === 'main' && (
        <div className="onb-carte">
          <label htmlFor="onb-titre">{t('ajout.titreLabel')}</label>
          <input id="onb-titre" className="onb-input" value={titre} onChange={(e) => setTitre(e.target.value)}
                 placeholder={t('bienvenue.titreExemple')} />
          <span className="onb-label">{t('ajout.fmtBoite')}</span>
          {choixFormat}
          <button type="button" className="btn-copper onb-sm" disabled={busy || !titre.trim()} onClick={ajouterManuel}>
            {t('bienvenue.ajouterCeJeu')}
          </button>
          <p>{t('bienvenue.detailsPlusTard')}</p>
        </div>
      )}

      {error && <p className="hint" role="alert">{error}</p>}
      <p className="onb-toast" role="status">{toast}</p>

      <span className="onb-label">{t('bienvenue.ajoutes', { n: jeux.length })}</span>
      {jeux.length === 0
        ? <div className="onb-vide">{t('bienvenue.vide')}<br />{t('bienvenue.videSuite')}</div>
        : (
          <ul className="onb-liste">
            {jeux.map((j) => (
              <li key={j.id} className="onb-ajoute">
                {j.coverName
                  ? <img className="onb-cov" src={`/api/cover/${j.coverName}`} alt="" />
                  : <span className="onb-cov cover-placeholder" aria-hidden>♟</span>}
                <span className="onb-t">{j.titre}</span>
                <button type="button" className="onb-fmt" onClick={() => changerFormat(j)}
                        aria-label={t('import.fmtAria', { j: j.titre, f: formatShort(j.format, lang) })}>
                  {formatShort(j.format, lang)}
                </button>
                <button type="button" className="onb-retirer" onClick={() => retirer(j)}
                        aria-label={t('ludotheque.retirerAria', { j: j.titre })}>✕</button>
              </li>
            ))}
          </ul>
        )}

      <div className="onb-pied">
        {jeux.length > 0
          ? <button type="button" className="btn-copper" disabled={busy} onClick={terminer}>{t('bienvenue.terminer', { n: jeux.length })}</button>
          : <button type="button" className="onb-lien" disabled={busy} onClick={terminer}>{t('bienvenue.passer')}</button>}
      </div>
    </div>
  );
}
