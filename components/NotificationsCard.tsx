'use client';
import { useEffect, useState } from 'react';
import type { CléDict } from '@/lib/i18n';
import { etatPush, activerPush, desactiverPush, type EtatPush } from '@/lib/pushClient';
import { useI18n } from './LanguageProvider';

// v4.9.0 — carte Notifications du profil : activer cet appareil (permission du navigateur),
// puis un interrupteur par type (préférence du compte, tous les appareils).
const TYPES: { type: string; label: CléDict; aide: CléDict }[] = [
  { type: 'invitations', label: 'notifs.invitations', aide: 'notifs.invitationsAide' },
  { type: 'reponses', label: 'notifs.reponses', aide: 'notifs.reponsesAide' },
  { type: 'rappel', label: 'notifs.rappel', aide: 'notifs.rappelAide' },
  { type: 'amis', label: 'notifs.amis', aide: 'notifs.amisAide' },
];

export default function NotificationsCard() {
  const { t } = useI18n();
  const [etat, setEtat] = useState<EtatPush>('chargement');
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    etatPush().then(setEtat).catch(() => setEtat('indispo'));
    fetch('/api/push').then((r) => r.json()).then((d) => setPrefs(d.prefs ?? {})).catch(() => {});
  }, []);

  async function activer() {
    setBusy(true); setErreur(false);
    try { setEtat(await activerPush()); } catch { setErreur(true); }
    setBusy(false);
  }
  async function desactiver() {
    setBusy(true);
    try { await desactiverPush(); setEtat('off'); } catch { setErreur(true); }
    setBusy(false);
  }
  async function basculer(type: string) {
    const actif = !prefs[type];
    setPrefs((p) => ({ ...p, [type]: actif }));
    const r = await fetch('/api/push', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, actif }) });
    if (!r.ok) setPrefs((p) => ({ ...p, [type]: !actif }));
  }

  if (etat === 'chargement') return null;
  return (
    <section className="foyer-card notifs-card" aria-label={t('notifs.titre')}>
      <div className="notifs-head">
        <p className="sous-label">{t('notifs.titre')}</p>
        {etat === 'on' && <span className="badge-etat b-enjeu"><span className="pt" />{t('notifs.actives')}</span>}
      </div>
      {etat === 'off' && <p className="hint">{t('notifs.intro')}</p>}
      {etat === 'iphone' && <p className="notifs-info">{t('notifs.iphone')}</p>}
      {etat === 'indispo' && <p className="notifs-info">{t('notifs.indispo')}</p>}
      {etat === 'bloquees' && <p className="notifs-info">{t('notifs.bloquees')}</p>}
      {(etat === 'off' || etat === 'bloquees') && (
        <button type="button" className="btn-copper" disabled={busy || etat === 'bloquees'} onClick={activer}>{t('notifs.activer')}</button>
      )}
      {erreur && <p className="error" role="alert">{t('notifs.erreur')}</p>}
      {etat === 'on' && (
        <>
          {TYPES.map(({ type, label, aide }) => (
            <div key={type} className="switch-row">
              <span className="txt"><b>{t(label)}</b><small>{t(aide)}</small></span>
              <button type="button" className="switch" role="switch" aria-checked={prefs[type] !== false}
                      aria-label={t(label)} onClick={() => basculer(type)} />
            </div>
          ))}
          <button type="button" className="link-btn" disabled={busy} onClick={desactiver}>{t('notifs.desactiver')}</button>
        </>
      )}
    </section>
  );
}
