import type { Metadata } from 'next';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLang(), 'faq.metaTitre') };
}

// Page publique statique : les 12 Q/R viennent du dict (fr = maquette validée,
// byte-identique). Les gras <b> sont composés en fragments (rNa/rNgN/rNb) autour
// des mots en gras — même pattern que foyer.videAvant/mot/videApres.
export default async function FaqPage() {
  const lang = await getLang();
  return (
    <main className="page faq-page">
      <h1>FAQ</h1>
      <p className="sous-titre">{t(lang, 'faq.sousTitre')}</p>

      <p className="kicker">{t(lang, 'faq.kJeu')}</p>
      <details className="faq" open>
        <summary aria-label={`${t(lang, 'faq.prefixe')} ${t(lang, 'faq.q1')}`}>{t(lang, 'faq.q1')}<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">{t(lang, 'faq.r1a')}<b>{t(lang, 'faq.r1g1')}</b>{t(lang, 'faq.r1b')}<b>{t(lang, 'faq.r1g2')}</b>{t(lang, 'faq.r1c')}</div>
      </details>
      <details className="faq">
        <summary aria-label={`${t(lang, 'faq.prefixe')} ${t(lang, 'faq.q2')}`}>{t(lang, 'faq.q2')}<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">{t(lang, 'faq.r2')}</div>
      </details>
      <details className="faq">
        <summary aria-label={`${t(lang, 'faq.prefixe')} ${t(lang, 'faq.q3')}`}>{t(lang, 'faq.q3')}<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">{t(lang, 'faq.r3')}</div>
      </details>
      <details className="faq">
        <summary aria-label={`${t(lang, 'faq.prefixe')} ${t(lang, 'faq.q4')}`}>{t(lang, 'faq.q4')}<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">{t(lang, 'faq.r4a')}<b>{t(lang, 'faq.r4g1')}</b>{t(lang, 'faq.r4b')}</div>
      </details>

      <p className="kicker">{t(lang, 'faq.kCompte')}</p>
      <details className="faq">
        <summary aria-label={`${t(lang, 'faq.prefixe')} ${t(lang, 'faq.q5')}`}>{t(lang, 'faq.q5')}<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">{t(lang, 'faq.r5a')}<b>{t(lang, 'faq.r5g1')}</b>{t(lang, 'faq.r5b')}<b>{t(lang, 'faq.r5g2')}</b>{t(lang, 'faq.r5c')}</div>
      </details>

      <p className="kicker">{t(lang, 'faq.kLudo')}</p>
      <details className="faq">
        <summary aria-label={`${t(lang, 'faq.prefixe')} ${t(lang, 'faq.q6')}`}>{t(lang, 'faq.q6')}<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">{t(lang, 'faq.r6a')}<b>{t(lang, 'faq.r6g1')}</b>{t(lang, 'faq.r6b')}</div>
      </details>
      <details className="faq">
        <summary aria-label={`${t(lang, 'faq.prefixe')} ${t(lang, 'faq.q7')}`}>{t(lang, 'faq.q7')}<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">{t(lang, 'faq.r7a')}<b>{t(lang, 'faq.r7g1')}</b>{t(lang, 'faq.r7b')}</div>
      </details>

      <p className="kicker">{t(lang, 'faq.kBoites')}</p>
      <details className="faq">
        <summary aria-label={`${t(lang, 'faq.prefixe')} ${t(lang, 'faq.q8')}`}>{t(lang, 'faq.q8')}<span className="caret" aria-hidden="true">›</span></summary>
        {/* Gras = libellés de format réutilisés (formats.*) : une seule source. */}
        <div className="rep">{t(lang, 'faq.r8a')}<b>{t(lang, 'formats.mini')}</b>{t(lang, 'faq.r8b')}<b>{t(lang, 'formats.petit')}</b>{t(lang, 'faq.r8c')}<b>{t(lang, 'formats.moyen')}</b>{t(lang, 'faq.r8d')}<b>{t(lang, 'formats.grand')}</b>{t(lang, 'faq.r8e')}</div>
      </details>
      <details className="faq">
        <summary aria-label={`${t(lang, 'faq.prefixe')} ${t(lang, 'faq.q9')}`}>{t(lang, 'faq.q9')}<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">{t(lang, 'faq.r9a')}<b>{t(lang, 'faq.r9g1')}</b>{t(lang, 'faq.r9b')}<b>{t(lang, 'faq.r9g2')}</b>{t(lang, 'faq.r9c')}</div>
      </details>

      <p className="kicker">{t(lang, 'faq.kRoue')}</p>
      <details className="faq" open>
        <summary aria-label={`${t(lang, 'faq.prefixe')} ${t(lang, 'faq.q10')}`}>{t(lang, 'faq.q10')}<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">{t(lang, 'faq.r10a')}<b>{t(lang, 'faq.r10g1')}</b>{t(lang, 'faq.r10b')}<b>{t(lang, 'faq.r10g2')}</b>{t(lang, 'faq.r10c')}<b>{t(lang, 'faq.r10g3')}</b>{t(lang, 'faq.r10d')}</div>
      </details>
      <details className="faq">
        <summary aria-label={`${t(lang, 'faq.prefixe')} ${t(lang, 'faq.q11')}`}>{t(lang, 'faq.q11')}<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">{t(lang, 'faq.r11a')}<b>{t(lang, 'faq.r11g1')}</b>{t(lang, 'faq.r11b')}</div>
      </details>
      <details className="faq">
        <summary aria-label={`${t(lang, 'faq.prefixe')} ${t(lang, 'faq.q12')}`}>{t(lang, 'faq.q12')}<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">{t(lang, 'faq.r12a')}<b>{t(lang, 'faq.r12g1')}</b>{t(lang, 'faq.r12b')}</div>
      </details>
    </main>
  );
}
