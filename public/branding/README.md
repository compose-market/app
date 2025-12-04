# Compose.Market Branding Assets

Official branding assets for Compose.Market - the Web3 Native AI Agent Marketplace.

## Logo Files

### SVG (Vector - Scalable)
| File | Description | Use Case |
|------|-------------|----------|
| `compose-logo.svg` | Transparent background | Dark backgrounds, overlays |
| `compose-logo-dark.svg` | Dark (#020617) background | Standalone use, light backgrounds |
| `compose-logo-white.svg` | Monochrome version | Print, light backgrounds |
| `workflow-cube.svg` | Composability symbol | Marketing, illustrations |
| `favicon.svg` | Simplified for small sizes | Browser favicon |

### PNG (Raster)
Located in `./png/`:

**With Dark Background:**
- `logo-16.png` - 16×16px
- `logo-32.png` - 32×32px
- `logo-48.png` - 48×48px
- `logo-64.png` - 64×64px
- `logo-128.png` - 128×128px (social media avatars)
- `logo-256.png` - 256×256px
- `logo-512.png` - 512×512px (social sharing)
- `logo-1024.png` - 1024×1024px (high-res marketing)

**Transparent Background:**
Same sizes as above with `-transparent` suffix.

**Workflow Cube:**
- `workflow-cube-64.png` to `workflow-cube-512.png`

## Favicon Files

Located in `./favicons/`:

| File | Size | Platform |
|------|------|----------|
| `favicon-16x16.png` | 16×16 | Standard favicon |
| `favicon-32x32.png` | 32×32 | High-DPI favicon |
| `favicon-48x48.png` | 48×48 | Windows taskbar |
| `apple-touch-icon.png` | 180×180 | iOS home screen |
| `android-chrome-192x192.png` | 192×192 | Android PWA |
| `android-chrome-512x512.png` | 512×512 | Android splash |

## Brand Colors

| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| Cyan (Primary) | `#22d3ee` | `188 95% 43%` | Primary actions, links |
| Fuchsia (Accent) | `#d946ef` | `292 85% 55%` | Accents, highlights |
| Dark Background | `#020617` | `222 47% 3%` | Main background |
| Cyan-950 (Node Fill) | `#083344` | - | Logo node centers |

## Typography

- **Display:** Orbitron (headers, brand text)
- **Body:** Rajdhani (UI, paragraphs)
- **Code:** Fira Code (monospace, technical)

## Usage Guidelines

1. **Minimum Size:** Don't use the logo smaller than 16×16px
2. **Clear Space:** Maintain padding equal to 25% of logo width
3. **Background:** Use dark version on light backgrounds, transparent on dark
4. **Don't:** Stretch, rotate, add effects, or change colors

## Regenerating Assets

To regenerate all PNG assets from SVGs:

```bash
npx tsx script/generate-branding-assets.ts
```

---

© 2025 Compose.Market - Powered by Manowar













