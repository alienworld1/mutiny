import { Assets, Rectangle, Texture } from "pixi.js";
import { scenery, characterAtlas } from "./assets";
import manifest from "./art-manifest.json";

export interface StageArt {
  environment?: Texture;
  layers?: { backdrop: Texture; ground: Texture; foreground: Texture };
  characters?: Texture[];
  props?: Texture[];
  poses?: {
    walk: Texture[];
    action: Texture[];
    refuse: Texture[];
    hit: Texture[];
    defeated: Texture[];
  };
}
function frames(texture: Texture, definitions: { rect: number[] }[]) {
  return definitions.map(
    ({ rect: r }) =>
      new Texture({
        source: texture.source,
        frame: new Rectangle(r[0]!, r[1]!, r[2]!, r[3]!),
      }),
  );
}
export async function loadStageArt(policy: string): Promise<StageArt> {
  const [environment, atlas, props, poses, responses] =
    await Promise.allSettled([
      Assets.load<Texture>(
        scenery[policy as keyof typeof scenery] ?? scenery.town,
      ),
      Assets.load<Texture>(characterAtlas),
      Assets.load<Texture>("/assets/art/props.webp"),
      Assets.load<Texture>("/assets/art/character-poses.webp"),
      Assets.load<Texture>("/assets/art/responses.webp"),
    ]);
  const env =
    environment.status === "fulfilled" ? environment.value : undefined;
  const layer = (start: number, height: number) =>
    new Texture({
      source: env!.source,
      frame: new Rectangle(
        0,
        (env!.height * start) / 680,
        env!.width,
        (env!.height * height) / 680,
      ),
    });
  return {
    environment: env,
    layers: env
      ? {
          backdrop: layer(0, 162),
          ground: layer(162, 448),
          foreground: layer(610, 70),
        }
      : undefined,
    characters:
      atlas.status === "fulfilled"
        ? frames(atlas.value, manifest.frames.idle)
        : undefined,
    props:
      props.status === "fulfilled"
        ? frames(props.value, manifest.frames.props)
        : undefined,
    poses:
      poses.status === "fulfilled"
        ? {
            walk: frames(poses.value, manifest.frames.walk),
            action: frames(poses.value, manifest.frames.action),
            refuse: frames(poses.value, manifest.frames.refuse),
            hit:
              responses.status === "fulfilled"
                ? frames(responses.value, manifest.frames.hit)
                : [],
            defeated:
              responses.status === "fulfilled"
                ? frames(responses.value, manifest.frames.defeated)
                : [],
          }
        : undefined,
  };
}
export function destroyStageArt(art: StageArt) {
  [
    ...(art.characters ?? []),
    ...(art.props ?? []),
    ...Object.values(art.poses ?? {}).flat(),
    ...Object.values(art.layers ?? {}),
  ].forEach((texture) => texture.destroy(false));
}
