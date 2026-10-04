export const metadata = { title: 'FAQ — What Shall We Play?' };

export default function FaqPage() {
  return (
    <main className="page faq-page">
      <h1>FAQ</h1>
      <p className="sous-titre">Tout ce qu&apos;il faut savoir avant de lancer la roue — et après.</p>

      <p className="kicker">Le jeu du soir</p>
      <details className="faq" open>
        <summary aria-label="FAQ : C'est quoi What Shall We Play ?">C&apos;est quoi What Shall We Play ?<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">L&apos;app du jeu du soir : tu marques tes envies sur <b>l&apos;étagère</b>,
          la <b>roue</b> choisit la boîte de la soirée, et chacun note scores et verdicts.
          Fini le « alors on joue à quoi ? » qui dure 40 minutes.</div>
      </details>
      <details className="faq">
        <summary aria-label="FAQ : C'est quoi l'étagère ?">C&apos;est quoi l&apos;étagère ?<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">La sélection du moment de ton groupe : les jeux prêts à sortir.
          Tu y votes 👍 pour tes envies du soir, et tout le monde voit les votes en direct.</div>
      </details>
      <details className="faq">
        <summary aria-label="FAQ : Comment marche le vote 👍 ?">Comment marche le vote 👍 ?<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">Un clic pour voter, re-clic pour retirer. Les votes se partagent en direct :
          quand la soirée se prépare, chacun sait déjà ce que les autres ont envie de sortir.</div>
      </details>
      <details className="faq">
        <summary aria-label="FAQ : La roue peut-elle refuser nos favoris ?">La roue peut-elle refuser nos favoris ?<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">Non — elle les chouchoute : les boîtes les mieux notées passent{" "}
          <b>un peu</b> plus souvent (au plus ~10 % d&apos;écart). La surprise reste reine :
          un jeu jamais joué garde toutes ses chances.</div>
      </details>

      <p className="kicker">Ton compte</p>
      <details className="faq">
        <summary aria-label="FAQ : Comment se créer un compte ?">Comment se créer un compte ?<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">Juste un <b>pseudo</b> et un <b>code secret à 4 chiffres</b>.
          Pas d&apos;adresse e-mail, pas de mot de passe à retenir par cœur — tu entres, tu joues.</div>
      </details>

      <p className="kicker">Ta ludothèque</p>
      <details className="faq">
        <summary aria-label="FAQ : Comment ajouter ses jeux ?">Comment ajouter ses jeux ?<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">Deux façons : à la main (titre, format, joueurs…), ou en important
          ta <b>collection BoardGameGeek</b> — l&apos;app récupère pochette et détails en un clin d&apos;œil.</div>
      </details>
      <details className="faq">
        <summary aria-label="FAQ : Qui peut modifier ou supprimer quoi ?">Qui peut modifier ou supprimer quoi ?<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">Ton foyer garde la main sur sa ludothèque. Les suppressions sont toujours{" "}
          <b>explicites et confirmées</b> : rien ne disparaît tout seul, jamais.</div>
      </details>

      <p className="kicker">Les boîtes &amp; la taille</p>
      <details className="faq">
        <summary aria-label="FAQ : C'est quoi les formats de boîte ?">C&apos;est quoi les formats de boîte ?<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">Chaque jeu a une taille : <b>Mini</b>, <b>Petit</b>, <b>Moyen</b>{" "}
          ou <b>Grand</b> (le repère : 30×30 cm). L&apos;étagère regroupe les jeux par format,
          et les filtres laissent n&apos;afficher qu&apos;une taille — pratique pour une soirée
          à table restreinte ou un pique-nique.</div>
      </details>
      <details className="faq">
        <summary aria-label="FAQ : Je peux corriger la taille d'un jeu ?">Je peux corriger la taille d&apos;un jeu ?<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">Oui : depuis la <b>ludothèque</b>, le format se change d&apos;un clic
          sur chaque jeu. À l&apos;<b>import BGG</b>, tu choisis un format par défaut pour
          toutes les boîtes, puis tu ajustes chacune en un tapotement si besoin.</div>
      </details>

      <p className="kicker">La roue &amp; les verdicts</p>
      <details className="faq" open>
        <summary aria-label="FAQ : C'est quoi le verdict 😍🙂😐 ?">C&apos;est quoi le verdict 😍🙂😐 ?<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">Après la soirée, chacun dit si la boîte était <b>adorée</b>, <b>bien</b>{" "}
          ou <b>neutre</b>. Ça alimente tes stats (« tu as adoré Cascadia 4 fois sur 5 »)
          et pèse doucement sur les futurs tirages.</div>
      </details>
      <details className="faq">
        <summary aria-label="FAQ : Comment on note la soirée ?">Comment on note la soirée ?<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">À la fin de la partie, le <b>carnet de scores</b> : points de chacun,
          podium, médailles. Puis le verdict, et le résultat part sur WhatsApp en un clic.</div>
      </details>
      <details className="faq">
        <summary aria-label="FAQ : Et les amis sans compte ?">Et les amis sans compte ?<span className="caret" aria-hidden="true">›</span></summary>
        <div className="rep">Ça arrive — les <b>joueurs invités</b> (sans compte, ajoutés à la soirée)
          sont en préparation. Ils pourront jouer et être notés comme les autres.</div>
      </details>
    </main>
  );
}
