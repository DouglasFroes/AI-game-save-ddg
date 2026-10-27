/** The glossy 150×150 rounded tile that hub icons are drawn on; clips later drawing to it. */
export function iconTile(ctx: CanvasRenderingContext2D, top: string, bottom: string): void {
  const grad = ctx.createLinearGradient(0, 0, 0, 150);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(0, 0, 150, 150, 22);
  ctx.fill();
  ctx.clip();
}

/** The soft top gloss, drawn last so it sits over the picture. */
export function iconGloss(ctx: CanvasRenderingContext2D): void {
  const gloss = ctx.createLinearGradient(0, 0, 0, 75);
  gloss.addColorStop(0, 'rgba(255,255,255,0.26)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, 150, 75);
}
