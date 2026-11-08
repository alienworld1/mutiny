import { Assets, Rectangle, Texture } from "pixi.js";

import { scenery, characterAtlas } from "./assets";

export interface StageArt {
  environment?: Texture;
  characters?: Texture[];
  props?: Texture[];
}
export async function loadStageArt(policy: string): Promise<StageArt> {
  const [environment, atlas, props] = await Promise.allSettled([
    Assets.load<Texture>(
      scenery[policy as keyof typeof scenery] ?? scenery.town,
    ),
    Assets.load<Texture>(characterAtlas),
    Assets.load<Texture>("/assets/art/props.webp"),
  ]);
  return {
    environment:
      environment.status === "fulfilled" ? environment.value : undefined,
    props:
      props.status === "fulfilled"
        ? Array.from(
            { length: 3 },
            (_, i) =>
              new Texture({
                source: props.value.source,
                frame: new Rectangle(
                  (i * props.value.width) / 3,
                  0,
                  props.value.width / 3,
                  props.value.height,
                ),
              }),
          )
        : undefined,
    characters:
      atlas.status === "fulfilled"
        ? Array.from({ length: 8 }, (_, i) => {
            const texture = atlas.value,
              width = texture.width / 4,
              height = texture.height / 2;
            return new Texture({
              source: texture.source,
              frame: new Rectangle(
                (i % 4) * width,
                Math.floor(i / 4) * height,
                width,
                height,
              ),
            });
          })
        : undefined,
  };
}
