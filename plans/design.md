# Settle It — Design System

## Vibe
Late-night bonfire with friends. Warm, glowing, alive. The UI should feel like firelight — deep dark backgrounds with amber and ember tones casting a warm glow. Playful and full of energy, but grounded in that cozy "gathered around a fire" feeling.

---

## Color Palette

| Role | Value | Notes |
|---|---|---|
| Background | `#0d0905` | Near-black with warm brown undertone |
| Surface | `#1a1208` | Cards, inputs, elevated elements |
| Surface raised | `#241a0e` | Hover states, active surfaces |
| Border | `#3d2e1a` | Subtle warm borders |
| Primary accent | `#e8831a` | Warm amber — the "ember" color |
| Primary glow | `#e8831a44` | Accent with alpha for glow effects |
| Primary hover | `#f09030` | Lighter amber on hover |
| Text primary | `#f5ede0` | Warm off-white, not pure white |
| Text secondary | `#a08060` | Muted warm tone |
| Text dim | `#5c4433` | Very muted, ghost text |
| Error | `#e05050` | Still red but less aggressive |
| Success | `#60c080` | Warm green |

---

## Typography

**Font**: [Nunito](https://fonts.google.com/specimen/Nunito) — rounded, friendly, playful without being childish. Pairs a quirky personality with readability on mobile.

| Role | Size | Weight |
|---|---|---|
| App title (h1) | `3.5rem` | `900` (Black) |
| Section header | `1.5rem` | `800` (ExtraBold) |
| Body | `1rem` | `600` (SemiBold) |
| Label/caption | `0.875rem` | `600` |
| Button | `1rem` | `800` |

Load via Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;800;900&display=swap" rel="stylesheet">
```

---

## Buttons

Chunky tap targets with warm ember glow. All buttons minimum `52px` tall for mobile.

### Primary Button
- Background: `#e8831a`
- Border radius: `1rem` (rounded, not pill)
- Box shadow: `0 0 16px #e8831a55, 0 4px 12px rgba(0,0,0,0.4)`
- On press: scale `0.95`, glow intensifies
- On hover: background lightens to `#f09030`, glow expands

### Secondary Button
- Background: transparent
- Border: `2px solid #3d2e1a`
- On hover: border becomes `#e8831a`, soft glow appears

### Ghost Button
- No background, no border
- Text: `#a08060`
- On hover: text warms to `#f5ede0`

---

## Animations

Full energy — everything should feel alive and satisfying. Use spring-based transitions where possible.

| Interaction | Animation |
|---|---|
| Button press | `scale(0.95)` + glow pulse, `100ms` |
| Button release | Spring back `scale(1.0)`, `200ms` |
| Page enter | Slide up + fade in, `300ms ease-out` |
| Card appear | Bounce in from below, staggered if multiple |
| Error shake | Horizontal shake, `400ms` |
| Success | Quick scale up + glow flash |
| Room code reveal | Pop in with bounce, `400ms` |
| Player joins lobby | Slide in from right with bounce |
| Vote/response submit | Satisfying pulse + lock animation |

CSS spring approximation:
```css
transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
```

---

## Inputs

- Background: `#1a1208`
- Border: `2px solid #3d2e1a`
- Border radius: `0.75rem`
- Padding: `0.875rem 1rem`
- On focus: border → `#e8831a`, subtle amber glow `box-shadow: 0 0 0 3px #e8831a33`
- Text: `#f5ede0`
- Placeholder: `#5c4433`

---

## Mobile-First Principles

- All interactive elements minimum `52px` tall
- Max content width: `420px`, centered
- Bottom-heavy layouts — thumbs reach the bottom of the screen
- Large room codes displayed in chunky monospace for easy reading at a distance (bonfire scenario)
- High contrast text on all interactive elements

---

## Atmosphere Details

- Subtle vignette on backgrounds (darkened edges, lighter center)
- Room code should feel like a neon sign — glowing monospace text
- Loading states: pulsing ember glow, not a spinner
- Empty states: warm, inviting, not clinical

---

## Page-by-Page Notes

### Home (/)
- Big playful "Settle It" title with a subtle warm text glow
- Two chunky CTA buttons stacked vertically

### Lobby / Host (/host/[code])
- Room code displayed large and glowing — people across the fire need to read it
- Player list with bounce-in animations as people join

### Play (/play/[code])
- Question takes center stage — large, readable text
- Answer options as big chunky tap targets filling the screen
- Vote progress feels satisfying and live

### Summary (/summary)
- Celebratory — results pop in with bounce animations
- Warm, energetic finish
