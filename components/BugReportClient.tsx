'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import pkg from '../package.json';
import { t as traduire, type Lang } from '@/lib/i18n';
import { useI18n } from './LanguageProvider';

// Rapporter un bug : un formulaire simple, le contexte technique rassemblé
// automatiquement (bloc « Informations envoyées » = transparence totale avant
// l'envoi), l'issue ouverte par le serveur. Pas de capture automatique (choix
// v3.4) : l'utilisateur joint la sienne s'il le veut. L'écran succès est un
// ÉTAT (pas une route) : un refresh remet un formulaire vierge, ne reposte pas.

type TypeSignalement = 'bug' | 'amelioration';
type Infos = { appareil: string; navigateur: string; ecran: string; langue: string; installation: string };

interface NavigatorUAData {
  platform: string;
  brands?: { brand: string; version: string }[];
  getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string; platformVersion?: string }>;
}

async function infosAppareil(lang: Lang): Promise<Infos> {
  const ecran = `${window.screen.width} × ${window.screen.height} @${window.devicePixelRatio}x`;
  const langue = navigator.language || 'fr';
  const installe = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const uad = (navigator as unknown as { userAgentData?: NavigatorUAData }).userAgentData;
  let appareil = traduire(lang, 'bugs.inconnu');
  let navigateur = traduire(lang, 'bugs.inconnu');
  if (uad) {
    try {
      const h = (await uad.getHighEntropyValues?.(['model', 'platformVersion'])) ?? {};
      const os = h.platformVersion ? `${uad.platform} ${h.platformVersion.split('.')[0]}` : uad.platform;
      appareil = h.model ? `${h.model} · ${os}` : os;
    } catch { appareil = uad.platform; }
    const chrome = uad.brands?.find((b) => b.brand !== 'Chromium' && !/Not.?A.Brand/i.test(b.brand));
    navigateur = chrome ? `${chrome.brand.replace('Google ', '')} ${chrome.version.split('.')[0]}` : 'Chromium';
  } else {
    // Apple ne livre pas userAgentData : appareil et Safari depuis l'UA.
    const ua = navigator.userAgent;
    const ios = ua.match(/OS (\d+[_\d]*)/);
    if (/iPhone/.test(ua)) appareil = ios ? `iPhone · iOS ${ios[1].replace(/_/g, '.')}` : 'iPhone';
    else if (/iPad/.test(ua)) appareil = ios ? `iPad · iPadOS ${ios[1].replace(/_/g, '.')}` : 'iPad';
    else if (/Macintosh/.test(ua)) appareil = 'Mac';
    const saf = ua.match(/Version\/([\d.]+)/);
    if (saf) navigateur = `Safari ${saf[1].split('.')[0]}`;
  }
  return { appareil, navigateur, ecran, langue, installation: traduire(lang, installe ? 'bugs.installOui' : 'bugs.installNon') };
}

export default function BugReportClient({ pseudo }: { pseudo: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<TypeSignalement>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [capture, setCapture] = useState<File | null>(null);
  const [apercuUrl, setApercuUrl] = useState<string | null>(null);
  const [device, setDevice] = useState<Infos | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<{ url: string; numero: number } | null>(null);

  useEffect(() => { infosAppareil(lang).then(setDevice).catch(() => setDevice(null)); }, [lang]);
  useEffect(() => () => { if (apercuUrl) URL.revokeObjectURL(apercuUrl); }, [apercuUrl]);

  const titreOk = title.trim().length >= 3 && title.trim().length <= 120;
  const descOk = description.trim().length >= 10 && description.trim().length <= 4000;
  const pret = titreOk && descOk && !envoi && !succes;
  const pageOrigine = params.get('depuis') || '/bugs';

  function choisirCapture(f: File | null) {
    if (apercuUrl) URL.revokeObjectURL(apercuUrl);
    setCapture(f);
    setApercuUrl(f ? URL.createObjectURL(f) : null);
  }

  async function envoyer() {
    if (!pret) return;
    setEnvoi(true); setError(null);
    const form = new FormData();
    form.set('title', title);
    form.set('type', type);
    form.set('description', description);
    form.set('page', pageOrigine);
    form.set('device', JSON.stringify(device ?? {}));
    if (capture) form.set('capture', capture);
    try {
      const res = await fetch('/api/bugs', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t('bugs.errEnvoi')); setEnvoi(false); return; }
      setSucces({ url: data.issueUrl, numero: data.issueNumber });
      navigator.vibrate?.([50, 30, 50]);
      router.refresh();
    } catch {
      setError(t('bugs.errReseau'));
      setEnvoi(false);
    }
  }

  if (succes) {
    return (
      <div className="bug-succes">
        <div className="bug-rond" aria-hidden="true">✓</div>
        <h3>{t('bugs.merciTitre')}</h3>
        <p>{t('bugs.succesAvant')}<b>{t('bugs.succesIssue', { n: succes.numero })}</b>{t('bugs.succesApres')}</p>
        <a className="bug-lien" href={succes.url} target="_blank" rel="noopener noreferrer">{succes.url.replace('https://github.com/', 'github.com/')} →</a>
        <button type="button" className="bug-annuler" onClick={() => router.push('/etagere')}>{t('bugs.retourEtagere')}</button>
      </div>
    );
  }

  return (
    <>
      <h1>{t('bugs.titre')}</h1>
      <p className="bug-intro">{t('bugs.intro')}</p>
      <div className="bug-field">
        <label htmlFor="bug-titre">{t('bugs.labelTitre')}</label>
        <input id="bug-titre" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
               placeholder={t('bugs.phTitre')} aria-describedby="bug-titre-aide" />
        <span className="bug-aide" id="bug-titre-aide">{title.trim().length}/120</span>
      </div>
      <div className="bug-field" role="radiogroup" aria-label={t('bugs.typeAria')}>
        <label>{t('bugs.labelType')}</label>
        <div className="bug-types">
          <button type="button" className={'bug-type' + (type === 'bug' ? ' on' : '')} aria-pressed={type === 'bug'} onClick={() => setType('bug')}>
            <span className="t" aria-hidden="true">🐛</span>{t('bugs.typeBug')}
          </button>
          <button type="button" className={'bug-type amelio' + (type === 'amelioration' ? ' on' : '')} aria-pressed={type === 'amelioration'} onClick={() => setType('amelioration')}>
            <span className="t" aria-hidden="true">✨</span>{t('bugs.typeAmelioration')}
          </button>
        </div>
      </div>
      <div className="bug-field">
        <label htmlFor="bug-desc">{t('bugs.labelDesc')}</label>
        <textarea id="bug-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000}
                  placeholder={t('bugs.phDesc')} />
        <span className="bug-aide">{description.trim().length}/4000</span>
      </div>
      <div className="bug-field">
        <label>{t('bugs.labelCapture')}</label>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
               onChange={(e) => choisirCapture(e.target.files?.[0] ?? null)} />
        {!capture ? (
          <button type="button" className="bug-drop" onClick={() => fileRef.current?.click()}>{t('bugs.joindreCapture')}</button>
        ) : (
          <div className="bug-apercu">
            <span className="mini">{apercuUrl ? <img src={apercuUrl} alt="" /> : '🖼️'}</span>
            <div><b>{capture.name}</b><span>{t('bugs.captureKo', { ko: (capture.size / 1024).toFixed(0) })}</span></div>
            <button type="button" className="retirer" onClick={() => choisirCapture(null)}>{t('bugs.retirer')}</button>
          </div>
        )}
      </div>
      <details className="bug-infos" open>
        <summary>{t('bugs.infosTitre')}</summary>
        <ul>
          <li>{t('bugs.infoVersion')} <b>v{pkg.version}</b></li>
          <li>{t('bugs.infoPage')} <b>{pageOrigine}</b></li>
          <li>{t('bugs.infoAppareil')} <b>{device ? `${device.appareil} · ${device.navigateur}` : '…'}</b></li>
          <li>{t('bugs.infoEcran')} <b>{device?.ecran ?? '…'}</b></li>
          <li>{t('bugs.infoLangue')} <b>{device ? `${device.langue} · ${device.installation}` : '…'}</b></li>
          <li>{t('bugs.infoSignalePar')} <b>{pseudo}</b></li>
        </ul>
      </details>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="btn-copper" disabled={!pret} onClick={envoyer}>
        {envoi ? t('bugs.envoi') : type === 'bug' ? t('bugs.envoyerBug') : t('bugs.envoyerAmelioration')}
      </button>
      <button type="button" className="bug-annuler" onClick={() => router.back()}>{t('bugs.annuler')}</button>
    </>
  );
}
