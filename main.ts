// EMBERLINE entrypoint for best-game-01 (Node 22, standard library only).
//
// The grader runs this file against the repository at the submitted commit.
// Its only job is to hand the game in: copy game/ and screenshots/ into the
// output directory, then write dossier.json — the summary the AI judge reads
// — using the kit's vendored library, which is the single source of truth
// for the dossier format. Outside the grader, MAKEFUN_OUTPUT_DIR stands in
// for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The caps below mirror the scorer's gate: the dossier text is capped at
// 160 KiB, screenshots at 4 files of 256 KiB each, game/ at 993 entries and
// 48 MiB with no path over 1000 bytes.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
