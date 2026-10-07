'use client';
import { useEffect, useState } from 'react';
import { etatPush, activerPush } from '@/lib/pushClient';
import { useI18n } from './LanguageProvider';

// v4.9.0 — sur Parties, quand on a une invitation : proposer d'être prévenu la prochaine
// fois. Seulement si cet appareil peut s'abonner et ne l'est pas ; ✕ le masque pour de bon.
const CLE = 'wsp_bandeau_notifs';

export default function BandeauNotifications() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let masque = false;
    try { masque = localStorage.getItem(CLE) === '1'; } catch { /* stockage indisponible */ }
    if (!masque) etatPush().then((e) => setVisible(e === 'off')).catch(() => {});
  }, []);
  if (!visible) return null;
  const fermer = () => { setVisible(false); try { localStorage.setItem(CLE, '1'); } catch { /* idem */ } };
  return (
    <div className="propose-notifs" role="region" aria-label={t('notifs.titre')}>
      <span aria-hidden="true">🔔</span>
      <span className="txt">{t('notifs.bandeau')}</span>
      <button type="button" className="btn-copper sm" onClick={() => activerPush().then((e) => { if (e !== 'off') setVisible(false); }).catch(() => {})}>
        {t('notifs.bandeauActiver')}
      </button>
      <button type="button" className="x" aria-label={t('notifs.plusTard')} onClick={fermer}>✕</button>
    </div>
  );
}
