// Export locally generated source sheets. Requires ImageMagick; no runtime service.
// Write dimensions.json (source name -> [width, height]), then:
// node scripts/export-kingdom-art.mjs /path/to/source-pngs | bash
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const source = resolve(process.argv[2] ?? "output/art-source");
const output = resolve("app/public/assets/art");
const work = mkdtempSync(join(tmpdir(), "mutiny-art-"));
const commands = ["set -euo pipefail"];
const quote = (arg) => "'" + String(arg).replaceAll("'", "'\\''") + "'";
const convert = (...args) =>
  commands.push(["convert", ...args].map(quote).join(" "));
const names = [
  "Rook",
  "Mallow",
  "Nix",
  "Dot",
  "Brisk",
  "Peebles",
  "Captain",
  "Supervisor",
];
function cell(
  sheet,
  cols,
  rows,
  index,
  width = 256,
  height = 320,
  fitHeight = 280,
) {
  const input = join(source, `${sheet}.png`);
  const [sw, sh] = JSON.parse(
    readFileSync(join(source, "dimensions.json"), "utf8"),
  )[sheet];
  const cw = Math.floor(sw / cols),
    ch = Math.floor(sh / rows);
  const cropX =
    (index % cols) * cw - (sheet === "poses2" && index === 6 ? 64 : 0);
  const cropWidth =
    cw +
    (sheet === "poses2" && index === 6
      ? 64
      : sheet === "poses" && index === 8
        ? 48
        : 0);
  const path = join(work, `${sheet}-${index}-${width}-${height}.png`);
  const raw = join(work, `raw-${sheet}-${index}.png`);
  convert(
    input,
    "-crop",
    `${cropWidth}x${ch}+${cropX}+${Math.floor(index / cols) * ch}`,
    "+repage",
    raw,
  );
  // Crop the complete connected figure, excluding stray neighboring-cell pieces.
  commands.push(
    `sprite_bounds=$(convert ${quote(raw)} -alpha extract -threshold 5% -define connected-components:verbose=true -connected-components 8 null: | awk '!found && /gray\\(255\\)/ {print $2; found=1}')`,
  );
  commands.push('test -n "$sprite_bounds"');
  commands.push(
    ["convert", raw].map(quote).join(" ") +
      ' -crop "$sprite_bounds" ' +
      [
        "+repage",
        "-resize",
        `${width - 24}x${fitHeight}`,
        "-background",
        "none",
        "-gravity",
        "south",
        "-splice",
        "0x16",
        "-gravity",
        "south",
        "-extent",
        `${width}x${height}`,
        path,
      ]
        .map(quote)
        .join(" "),
  );
  return path;
}
function atlas(name, files, rows, height = 320) {
  const strips = [];
  for (let row = 0; row < rows; row++) {
    const strip = join(work, `strip-${name}-${row}.png`);
    convert(...files.slice(row * 4, row * 4 + 4), "+append", strip);
    strips.push(strip);
  }
  convert(...strips, "-append", "-quality", "85", join(output, `${name}.webp`));
  return files.map((_, i) => ({
    rect: [(i % 4) * 256, Math.floor(i / 4) * height, 256, height],
    pivot: [0.5, (height - 16) / height],
  }));
}
try {
  for (const name of ["dock", "bridge", "town"])
    convert(
      join(source, `${name}.png`),
      "-resize",
      "1280x1280!",
      "-quality",
      "83",
      join(output, `${name}.webp`),
    );
  const idle = atlas(
    "characters",
    names.map((_, i) => cell("characters", 4, 2, i)),
    2,
  );
  const portraits = atlas(
    "portraits",
    names.map((_, i) => cell("portraits", 4, 2, i, 256, 256, 232)),
    2,
    256,
  );
  const poses = [];
  if (existsSync(join(source, "poses-clean.png"))) {
    for (let i = 0; i < 24; i++)
      poses.push(
        i === 8
          ? cell("poses", 4, 6, 8)
          : i === 14
            ? cell("poses2", 4, 3, 6)
            : cell("poses-clean", 4, 6, i),
      );
  } else
    for (let pose = 0; pose < 3; pose++) {
      for (let i = 0; i < 4; i++) poses.push(cell("poses", 4, 6, pose * 8 + i));
      for (let i = 0; i < 4; i++)
        poses.push(cell("poses2", 4, 3, pose * 4 + i));
    }
  const frames = atlas("character-poses", poses, 6);
  const responses = atlas(
    "responses",
    [
      ...names.map((_, i) => cell("characters", 4, 2, i)),
      ...names.map((_, i) =>
        cell(
          existsSync(join(source, "responses-clean.png"))
            ? "responses-clean"
            : "responses",
          4,
          4,
          8 + i,
          256,
          320,
          180,
        ),
      ),
    ],
    4,
  );
  const props = atlas(
    "props",
    Array.from({ length: 8 }, (_, i) => cell("props", 4, 2, i)),
    2,
  );
  const manifest = {};
  manifest.version = 2;
  manifest.source =
    "OpenAI built-in imagegen, 10 November 2026; locally exported WebP, no runtime generation";
  manifest.export =
    "Run node scripts/export-kingdom-art.mjs SOURCE_DIRECTORY | bash (dimensions.json maps source names to pixel sizes) with dock.png, bridge.png, town.png, characters.png, portraits.png, poses.png, poses2.png, responses.png and props.png. Export crops to the largest connected foreground figure (5% alpha threshold), excludes disconnected neighboring-cell pieces, fits visible standing bodies to 232x280, places feet at y=304 in 256x320 cells, then assembles and compresses local atlases. Defeated figures fit 180px height. Inspect each source cell before exporting. Wide Rook sword and Captain cape frames use wider source crops before connected-figure normalization.";
  manifest.production = {
    style:
      "Painterly gouache living miniature kingdom; shallow three-quarter orthographic view, simple strong adult silhouettes, expressive brows, warm diffuse daylight, restrained brush marks. Oxblood/slate/lichen/clay/chalk/brass. No theatre curtains, glossy 3D, bloom, baked text or grid.",
    locations:
      "Square backdrops, architecture and tiny background workers in top 24%, unobstructed low-detail rectangular playing floor x6-94% y24-90%, scenery only outside it. Dock: timber warehouse/crane/blue-green harbor. Bridge: stone checkpoint, clerk booth, bell and civic flags. Town: plaster/timber royal office, terracotta roofs, laundry and paperwork carriers.",
    characters:
      "4x2 atlas: Rook slate cap satchel/envelope; Mallow green round shield/lunchbox; Nix oxblood pointed hat, glasses, round staff; Dot ochre hood, feather, red scarf; Brisk grey-green armor, rectangular shield; Peebles weary plum bent hat, diamond staff; Captain blue bicorne brass feather cape sword; Supervisor oxblood tricorn folio baton. Transparent, complete boots/equipment, one identity per cell. Use characters.png as identity reference for every derived sheet.",
    portraits:
      "4x2 expressive chest-up busts in identity order, full hats, consistent face baseline, transparent. Fastidious Rook, protective Mallow, detached Nix, mischievous Dot, upright Brisk, exhausted Peebles, resourceful Captain, disapproving Supervisor.",
    poses:
      "First quartet: 4x6 sheet, walking in rows 1-2, action in rows 3-4, objection in rows 5-6; use rows 1/3/5. Second quartet: separate 4x3 sheet, walk/action/objection, explicitly exclude first quartet. Match reference identities. Walk lifted boot; action role-specific thrust/brace/cast/command; objection palm out, lowered weapon. Transparent, fixed feet.",
    responses:
      "4x4 sheet: hit/recoil first two rows, defeated seated or kneeling final two rows in identity order. No injuries/blood. Inspect identities; Use neutral textures plus procedural recoil for hits; generated hit rows clipped feet and failed identity QA. Optional responses-clean.png is the background-extracted assembled response sheet; only its defeated rows are used.",
    props:
      "4x2 transparent: payroll cart, damaged cart, crate, low stone cover; flame, smoke, delivery pennant, delivered cart with open chest. Match shallow projection and materials; no scenery or labels.",
  };
  manifest.frames = {
    idle,
    portraits,
    walk: frames.slice(0, 8),
    action: frames.slice(8, 16),
    refuse: frames.slice(16, 24),
    hit: responses.slice(0, 8),
    defeated: responses.slice(8, 16),
    props,
  };
  manifest.sceneLayers = {
    backdrop: [0, 0, 640, 162],
    ground: [0, 162, 640, 448],
    foreground: [0, 610, 640, 70],
  };
  manifest.identityOrder = names;
  manifest.propOrder = [
    "cart",
    "damaged cart",
    "crate",
    "low cover",
    "fire",
    "smoke",
    "exit",
    "delivered cart",
  ];
  writeFileSync(
    join(work, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  commands.push(
    `cp ${quote(join(work, "manifest.json"))} ${quote(resolve("app/src/stage/art-manifest.json"))}`,
  );
  commands.push(`rm -rf ${quote(work)}`);
  process.stdout.write(commands.join("\n") + "\n");
} catch (error) {
  rmSync(work, { recursive: true, force: true });
  throw error;
}
