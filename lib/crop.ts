// Math pure du recadrage carré (profil) — testée unitairement.
// La zone de cadrage affichée fait CROP_SQ px ; l'avatar enregistré fait AVATAR_SIZE px.
export const CROP_SQ = 320;
export const AVATAR_SIZE = 256;

// Échelle « cover » : à zoom 1, l'image remplit tout le carré (le grand côté déborde).
export function cropBase(naturalWidth: number, naturalHeight: number): number {
  return Math.max(CROP_SQ / naturalWidth, CROP_SQ / naturalHeight);
}

// Taille affichée à l'écran — le JS pilote la taille, jamais le CSS (une photo de
// téléphone sinon s'affiche à sa taille naturelle : zoom implicite ×10).
export function cropDisplaySize(naturalWidth: number, naturalHeight: number, zoom: number): { w: number; h: number } {
  const s = cropBase(naturalWidth, naturalHeight) * zoom;
  return { w: naturalWidth * s, h: naturalHeight * s };
}

// Bornes de glissement : l'image couvre toujours le carré, jamais de fond visible.
export function clampCropOffset(naturalWidth: number, naturalHeight: number, zoom: number, x: number, y: number): { x: number; y: number } {
  const s = cropBase(naturalWidth, naturalHeight) * zoom;
  const mx = Math.max(0, (naturalWidth * s - CROP_SQ) / 2);
  const my = Math.max(0, (naturalHeight * s - CROP_SQ) / 2);
  return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
}

// Rect source (coordonnées naturelles de l'image) que couvre le carré affiché,
// compte tenu du zoom et du déplacement utilisateur — utilisé par drawImage.
export function cropSourceRect(naturalWidth: number, naturalHeight: number, zoom: number, offX: number, offY: number): {
  sx: number; sy: number; sw: number; sh: number; displayW: number; displayH: number;
} {
  const s = cropBase(naturalWidth, naturalHeight) * zoom;
  const displayW = naturalWidth * s;
  const displayH = naturalHeight * s;
  const left = (CROP_SQ - displayW) / 2 + offX;
  const top = (CROP_SQ - displayH) / 2 + offY;
  return { sx: -left / s, sy: -top / s, sw: CROP_SQ / s, sh: CROP_SQ / s, displayW, displayH };
}
