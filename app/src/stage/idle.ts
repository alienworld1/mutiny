import type { StageView } from "./playback";

// Quiet puppet weight and bounded hazards. Logical cells never move here.
export function startIdle(scene: StageView, render: () => void) {
  const figures = Array.from(scene.entities, ([id, entity]) => ({
    id,
    entity,
    figure: entity.figure,
    scaleY: entity.figure?.scale.y ?? 1,
    rotation: entity.figure?.rotation ?? 0,
  }));
  const hazards = scene.hazards.map((h) => ({
    ...h,
    x: h.view.x,
    y: h.view.y,
    rotation: h.view.rotation,
    scaleX: h.view.scale.x,
    scaleY: h.view.scale.y,
    alpha: h.view.alpha,
  }));
  let frame = 0,
    last = 0;
  const began = performance.now();
  const tick = (time: number) => {
    if (time - last >= 1000 / 30) {
      last = time;
      for (const { id, entity, figure, rotation } of figures) {
        entity.selection?.scale.set(1 + Math.exp(-(time - began) / 65) * 0.2);
        if (!figure || id === "cart" || entity.busy || entity.defeated)
          continue;
        // One short posture adjustment per character, separated by quiet beats.
        const cycle = (time - began + id * 1700) % 14000;
        const gesture =
          cycle > 3000 && cycle < 3700
            ? Math.sin(((cycle - 3000) / 700) * Math.PI)
            : 0;
        figure.rotation = rotation + gesture * (id % 2 ? -0.025 : 0.025);
      }
      for (const h of hazards) {
        if (h.kind === "fire") {
          h.view.scale.set(
            h.scaleX * (1 + Math.sin(time / 180 + h.phase) * 0.035),
            h.scaleY * (1 + Math.sin(time / 130 + h.phase) * 0.065),
          );
        } else if (h.kind === "smoke") {
          h.view.x = h.x + Math.sin(time / 1100 + h.phase) * 2;
          h.view.y = h.y + Math.sin(time / 900 + h.phase) * 1.5;
        } else if (h.kind === "flag") {
          h.view.scale.y =
            h.scaleY * (1 + Math.sin(time / 600 + h.phase) * 0.08);
          h.view.rotation = h.rotation + Math.sin(time / 1200) * 0.035;
        } else if (h.kind === "water") {
          h.view.x = h.x + Math.sin(time / 1600 + h.phase) * 5;
          h.view.alpha = 0.5 + Math.sin(time / 1800 + h.phase) * 0.3;
        } else {
          const t = ((time + h.phase * 173) % 1500) / 1500;
          h.view.position.set(
            h.x + Math.sin(t * 6 + h.phase) * 3,
            h.y - t * 36,
          );
          h.view.alpha = (1 - t) * 0.7;
        }
      }
      render();
    }
    if (!document.hidden) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    for (const { figure, scaleY, rotation, entity } of figures) {
      entity.selection?.scale.set(1);
      if (figure && !entity.busy) {
        figure.scale.y = scaleY;
        figure.rotation = rotation;
      }
    }
    for (const h of hazards) {
      h.view.position.set(h.x, h.y);
      h.view.scale.set(h.scaleX, h.scaleY);
      h.view.alpha = h.alpha;
      h.view.rotation = h.rotation;
    }
  };
}
