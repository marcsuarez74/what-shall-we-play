'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import pkg from '../package.json';
import { FORMATS, FORMAT_SCALE, FORMAT_LABEL, coverSrc, avatarSrc } from '@/lib/formats';
import type { Game, Night, UserLite } from '@/lib/types';
import GameSheet from './GameSheet';
import NightPicker from './NightPicker';
import PlayerChip from './PlayerChip';

export default function ShelfClient({ night, players, games, users, plays, me }: {
  night: Night; players: UserLite[]; games: Game[]; users: UserLite[]; plays: Record<number, number>;
  me: UserLite;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<Game | null>(null);
  const [editingNight, setEditingNight] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const byFormat = useMemo(() => FORMATS.map((f) => ({ f, list: games.filter((g) => g.box_format === f) })), [games]);

  useEffect(() => {
    function closeMenu(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) menuRef.current.open = false;
    }
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  function toggle(id: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  async function launch() {
    if (selected.size === 0) return;
    router.push(`/tirage/${night.id}?games=${[...selected].join(',')}`);
  }
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  // Sélection par longue pression (400 ms) : maintien → mode sélection + jeu marqué.
  function startPress(g: Game, e: React.PointerEvent) {
    if (pickMode) return;
    pressStart.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => {
      suppressClick.current = true; // le click qui suit le relâchement ne doit pas ouvrir la fiche
      setPickMode(true);
      toggle(g.id);
      navigator.vibrate?.(15);
    }, 400);
  }
  function cancelPress(e?: React.PointerEvent) {
    // un déplacement du doigt (scroll) annule la pression ; un léger tremblement non
    if (e && pressStart.current) {
      const dx = e.clientX - pressStart.current.x, dy = e.clientY - pressStart.current.y;
      if (Math.hypot(dx, dy) > 10) { pressStart.current = null; if (pressTimer.current) clearTimeout(pressTimer.current); return; }
    }
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }
  function boxClick(g: Game) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (pickMode) toggle(g.id); else setDetail(g);
  }

  const initial = (me.pseudo ?? '?')[0].toUpperCase();
  const myAvatar = avatarSrc(me);

  return (
    <div className="shelf-screen">
      <header className="shelf-header">
        <h1>L&apos;étagère</h1>
        <details className="user-chip" ref={menuRef}>
          <summary aria-label="Menu utilisateur">
            {myAvatar ? <img className="chip-avatar" src={myAvatar} alt="" /> : <span aria-hidden="true">{me.sticker ?? '🎲'}</span>}
            {' '}{initial} ▾
          </summary>
          <div className="user-menu">
            <a href="/profil">Mon profil</a>
            <button type="button" onClick={logout}>Se déconnecter</button>
            <span className="user-version">v{pkg.version}</span>
          </div>
        </details>
      </header>
      <section className="night-card">
        <div className="night-card-head">
          <span className="night-label">SOIRÉE EN COURS</span>
          <button type="button" className="link-btn" onClick={() => setEditingNight(true)}>modifier</button>
        </div>
        <div className="chips">{players.map((p) => <PlayerChip key={p.id} u={p} />)}</div>
      </section>
      {byFormat.map(({ f, list }) => list.length === 0 ? null : (
        <section key={f} className="shelf-block">
          <div className="row" role="list">
            {list.map((g) => (
              <button key={g.id} role="listitem" className={`box ${selected.has(g.id) ? 'sel' : ''} ${FORMAT_SCALE[f] < 0.7 ? 'sm' : ''}`}
                      style={{ width: 96 * FORMAT_SCALE[f], height: 96 * FORMAT_SCALE[f] }}
                      onPointerDown={(e) => startPress(g, e)}
                      onPointerUp={() => cancelPress()}
                      onPointerLeave={() => cancelPress()}
                      onPointerMove={(e) => cancelPress(e)}
                      onPointerCancel={() => cancelPress()}
                      onContextMenu={(e) => e.preventDefault()}
                      onClick={() => boxClick(g)}>
                {selected.has(g.id) && <span className="selbadge">✓</span>}
                {coverSrc(g) ? <img src={coverSrc(g) as string} alt={g.title} /> : <span className="cover-placeholder">♟</span>}
              </button>
            ))}
          </div>
          <div className="rail" />
          <p className="row-label">{FORMAT_LABEL[f]} — on swipe ›</p>
        </section>
      ))}
      {pickMode && (
        <div className="pick-banner" role="status">
          <span>Sélection — touche les boîtes</span>
          <button type="button" onClick={() => setPickMode(false)}>Terminé</button>
        </div>
      )}
      <div className="cta-zone">
        <span className="chip selcount">Sélection : {selected.size} {selected.size > 1 ? 'jeux' : 'jeu'} ✓</span>
        <button className="btn-copper" disabled={selected.size === 0} onClick={launch}>
          {selected.size === 0 ? 'Touchez une boîte pour l\'ajouter' : `Lancer le tirage · ${selected.size}`}
        </button>
      </div>
      {detail && <GameSheet game={detail} players={players} playsCount={plays[detail.id] ?? 0}
                            inSelection={selected.has(detail.id)}
                            onToggle={() => toggle(detail.id)} onClose={() => setDetail(null)} />}
      {editingNight && (
        <div className="sheet-backdrop" onClick={() => setEditingNight(false)}>
          <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label="Modifier la soirée"
               onClick={(e) => e.stopPropagation()}>
            <button type="button" className="sheet-close" aria-label="Fermer" onClick={() => setEditingNight(false)}>✕</button>
            <NightPicker users={users} prechecked={players.map((p) => p.id)} night={night}
                         onClose={() => setEditingNight(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
