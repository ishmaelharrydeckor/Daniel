# Prolens — behavior spec (extracted from the live site's own code)

Source: https://prolens.framer.website/ (Framer). Values below are read from the site's scripts, not estimated.
Items marked **(inferred)** were matched by element role, not by an explicit label in the code.

## Global
- Font: Geist (400 / 500 / 600), letter-spacing about -0.03em to -0.04em.
- Header is `position: fixed`, z-index 2. Nav links and the logo use **Rolling Letters** (below).
- Tablet and phone breakpoints disable the hero parallax. Desktop breakpoint is min-width 1200px; tablet is 810–1199px.

## Text appear (word reveal)
- Trigger: element enters viewport (threshold 0.5), once.
- Each word: opacity 0.001 → 1 and y 2px → 0.
- Spring: bounce 0, duration 0.7s. Stagger 0.04s per word (0.02s on a few elements).
- Applied to headings, lead paragraphs, quotes, blog titles and dates, footer name. Hero H1 is split per character **(inferred)**.

## Rolling Letters (nav links, logo)
- Each letter sits in an `overflow: hidden` box of height 1em with two copies stacked (second copy at top: 100%).
- On mouse enter, if idle: both copies move y 0 → -100%. Tween, ease cubic-bezier(.8, 0, .4, 1), 0.4s.
- Per-letter delay: index × 0.05s. After the last letter finishes it resets to 0, so it can replay.

## Hero
- Load fades: opacity 0.001 → 1. Default spring (stiffness 250, damping 60). Some elements delay 0.3s (0.6s spring, bounce 0.2) and 0.5s (0.3s spring).
- **Parallax**: speed 90 on the hero section, desktop only. Measured ≈ translateY = scrollY × 0.2.
- **Ring loops**: "Ellipse bigger" rotates +360° over 72s, linear, infinite. "Ellipse biggest" rotates −360° over 86s, linear, infinite.
- **Chips** (Entrepreneur, Investor, Business Partner, Advisor) fly in from offsets and return when leaving view. Spring 2.6s, bounce 0.1.
  - Entrepreneur from (-20, -20); Investor from (30, -30); Business Partner from (20, 20); Advisor from (-40, 40) **(inferred assignment)**.
- Avatars: scale 1.05 → 1 on enter.

## About
- Accordion has Open and Closed variants. The plus icon rotates 90° when open. Each item is its own component, so items toggle independently.
- Four polaroids fly in with rotation, and reverse on exit. Spring 1s, bounce 0.1 **(inferred assignment)**:
  - from x -20, y -10, rotate +4; x -25, y -20, rotate +3; x -20, y -20, rotate -7; x -30, y -10, rotate +4.

## Projects
- Each project is a 100vh container, `position: sticky; top: 0`, z-index 1, 2, 3. Transparent, with the card centered, so the next card slides over the previous one.
- Scroll-linked, spring-smoothed (1.2s): progress = (threshold × viewport height − nextTop) / nextHeight, clamped 0–1, threshold 1. The previous card scales 1 → 0.85 (opacity stays 1). Last project does not scale.
- Center image block: enters from scale 0.95, y +30 and returns on exit. Spring 1.8s, bounce 0.1.
- Photo inside: scale 1.1 → 1 on enter, once. Spring 1.7s, bounce 0.1.
- Ring behind each project image rotates +360° over 72s, linear, infinite.

## Marquees (Ticker component)
- Distance / speed × 1000 ms. Speed default 100 px/s, linear, infinite, direction left.
- Photo strip: gap 32px, hover factor 0.5 (slows to half speed on hover).
- Testimonials: gap 30px, hover factor 1 (no change).

## Career
- Container ("Company slider", 643px) holds four 130px rows plus the "See all" block (123px, not sticky). Rows are `position: sticky; top: 0` with rising z-index; rows 2–4 have the grey background so they cover the previous one.
- Card: 624×112, white, radius 8. Logo badge 72px (grey circle, logo SVG 55×35 centered) inside an 86px dotted ring (static image). Text starts 124px from the card's left edge. Dates written `2025   →   Now`.
- Scroll-linked, spring-smoothed (1.2s): progress = (0.5 × viewport height − nextTop) / nextHeight, clamped 0–1. The card goes scale 1 → 0.9 and opacity 1 → 0.6. The last row's target is the "See all" block, so all four end at 0.9 / 0.6.
- Measured on the original: next row at top 450 → 0%, 419 → 24%, 350 → 77%, 299 → 100%.

## Blog
- Thumbnails: scale 1.1 → 1 on enter (50% in view), once.

## Contact form
- Fields use a bottom border #535a5e. Submit is a button with the sliding arrow.
