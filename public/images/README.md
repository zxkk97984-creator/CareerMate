# UI assets

- `kurisu-avatar.png`: generated with the built-in ImageGen tool from the selected CareerMate concept (`exec-f0806215-af5d-4ff0-8f77-b08cf9cb59bb.png`). Prompt: standalone centered head-and-shoulders Kurisu portrait, chestnut hair, violet eyes, white lab coat/red tie, clean 2D anime style, pale warm-gray background, readable at 40px, no UI or text. Original output: `exec-683b443f-0d0a-4611-8118-a518c6417547.png` (1254 × 1254).
- `companion/shuangling.webp`: copied unchanged at the user's request from `/home/zxk/Projects/K12-Learning-platform/frontend/public/spritesheet-extended.webp` (1536 × 2288, 8 columns × 11 rows). Frame layout and 220ms cadence reference that project's `features/companion/types.ts` and `lib/sprite.ts`. No modifications were made to K12-Learning-platform. This records provenance, not a new licensing grant.
- `companion/shuangling-avatar.png`: 512 × 512 static head-and-shoulders portrait cropped from the first idle frame of `companion/shuangling.webp` (`30,6 → 162,138`), upscaled with Lanczos, lightly sharpened, and vignette-blended onto the light warm-gray chat background. Used only as the crisp static message avatar; the animated dock keeps using the spritesheet.
- `companion/{anya,doraemon,kun-like,lulu-capybara,shinchan}.webp`: copied unchanged from
  `/home/zxk/Projects/K12-Learning-platform/frontend/public/pets/<id>/spritesheet.webp`
  (1536 × 1872, 8 columns × 9 rows). The row/frame contract comes from that project's
  `features/companion/types.ts` and `lib/sprite.ts`.
- `companion/{anya,doraemon,kun-like,lulu-capybara,shinchan}-avatar.png`: 512 × 512 static
  head-and-shoulders portraits generated from the first idle frame of the matching spritesheet
  (crop `30,5 → 162,137`), Lanczos upscale, light sharpening, and a light warm-gray background
  so they stay readable at 40px.

The original Kurisu Live2D assets remain in `public/live2d/`.
