#!/usr/bin/env python3
"""Generate per-case OG images for raghavahuja.com — 1200x630.

Usage:  python3 scripts/og-cases.py [slug ...]
Output: og/<slug>.png for each entry in CASES below (or just the listed slugs).

Cobalt + bone palette — matches the site's light-mode design system
(--paper #f4f0e6, --ink #14120e, --accent #2c4ec2 deep cobalt).

Used as a fallback when a real screenshot isn't viable (e.g., the EF case
study is password-gated and the page renders empty in headless capture).
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, sys

W, H = 1200, 630
# light-mode tokens from tokens.css — bone paper + deep cobalt
BG = (244, 240, 230)            # --paper
FG = (20, 18, 14)               # --ink
FG_MUTED = (90, 82, 66)         # ~ rgba(20,18,14,0.66)
FG_DIM = (130, 122, 105)        # ~ rgba(20,18,14,0.38) on bone
ACCENT = (44, 78, 194)          # --accent (deep cobalt)
LINE_A = (20, 18, 14, 38)

# slug, kicker, title, italic_accent, tail, sub, stack_l, stack_r
CASES = [
    ('arqo',
     'FOLIO 02 · CASE STUDY · NO. 01 · 2026',
     'Arqo.',
     'the mobile-first',
     'screenwriting app.',
     'Shipped solo in 9 days. Lossless FDX. CRDT collab. 777-script AI library.',
     'next.js 14 · supabase · pgvector',
     'liveblocks · yjs · tauri · capacitor'),
    ('jmnpr-labs',
     'FOLIO 02 · CASE STUDY · NO. 02 · 2026',
     'JMNPR Labs.',
     'a one-person studio,',
     'many verticals.',
     'Story Kit live. Five flagship tools on deck. Self-serve, no enterprise deals.',
     '@jmnpr/craft · react-pdf',
     'lemon squeezy · vercel'),
    ('ef',
     'FOLIO 02 · CASE STUDY · NO. 03 · 2022—now',
     'EF Education First.',
     'insurance,',
     'checkout, quoting.',
     'Gated. Email work.raghavahuja@gmail.com for password.',
     'senior product designer',
     '50+ countries'),
    ('futbolis',
     'FOLIO 03 · LAB · NO. 01 · 2026',
     'Futbolis.live.',
     'global pulse of football,',
     'one match at a time.',
     '100k concurrent on $19/mo infra. 4-tier geocoding. Real-time globe.',
     'next.js 16 · react 19 · mapbox gl',
     'vercel edge'),
    ('zulily',
     'CASE STUDY · NO. 04 · 2021—22',
     'Zulily.',
     'growth,',
     'personalization, lifecycle.',
     '16M+ daily sends. Stepped in as front-end during a staffing gap.',
     'react · experiment design',
     'data-science partnership'),
    ('social-booth',
     'CASE STUDY · NO. 05 · 2016—20',
     'The Social Booth.',
     'creative direction,',
     'Mumbai.',
     'Scaled a team 1 → 10+. Ducati, Audi, 20+ APAC enterprise clients.',
     'brand systems · campaigns',
     'retail · film'),
    ('hot-cold',
     'FOLIO 03 · LAB · NO. 02 · 2026',
     'Hot & Cold.',
     'extremes of earth,',
     'right now.',
     'A live moodpiece. Hottest and coldest places on earth, refreshed every 15 minutes.',
     'open-meteo · era5',
     'github actions · 15-min cron'),
    ('mamdani-mapper',
     'FOLIO 03 · LAB · NO. 03 · 2026',
     'Mamdani Mapper.',
     'every public stop,',
     'mapped.',
     'A cobalt map of every public stop NYC Mayor Mamdani has made. Receipts, not surveillance.',
     'mapbox gl · turf',
     'haiku 4.5 extraction · vercel'),
    ('mind',
     'FOLIO 02 · FRAMEWORK · F·01 · 2024—now',
     'MIND.',
     'a behavioral OS for',
     'high-stakes flows.',
     'Motivational Interface & Nudge Design. The framework underneath every checkout review at EF.',
     'behavioral framework',
     'in active use at ef'),
    ('hcai',
     'FOLIO 02 · FRAMEWORK · F·02 · 2023—now',
     'HCAI.',
     'designing for',
     'humans, with AI.',
     'A Human-Centered AI evaluation framework. The rubric for when AI belongs in a flow.',
     'human-centered ai rubric',
     'when ai belongs · when it doesn\'t'),
]

def load_fonts():
    return {
        'mono_sm':   ImageFont.truetype('/System/Library/Fonts/SFNSMono.ttf', 13),
        'serif_lg':  ImageFont.truetype('/System/Library/Fonts/Supplemental/Times New Roman.ttf', 72),
        'serif_it':  ImageFont.truetype('/System/Library/Fonts/Supplemental/Times New Roman Italic.ttf', 72),
        'serif_md':  ImageFont.truetype('/System/Library/Fonts/Supplemental/Times New Roman.ttf', 22),
    }

def draw_glow(img):
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse([W - 450, -250, W + 250, 400], fill=(44, 78, 194, 26))
    g.ellipse([-200, H - 250, 500, H + 200], fill=(20, 18, 14, 10))
    blurred = glow.filter(ImageFilter.GaussianBlur(180))
    img.paste(blurred, (0, 0), blurred)

def draw_case(slug, kicker, title, accent_word, tail, subtitle, stack_l, stack_r, fonts, out_path):
    img = Image.new('RGB', (W, H), BG)
    d0 = ImageDraw.Draw(img, 'RGBA')
    for x in range(0, W, 32):
        for y in range(0, H, 32):
            d0.rectangle([x, y, x+1, y+1], fill=(255, 255, 255, 12))

    draw_glow(img)
    d = ImageDraw.Draw(img, 'RGBA')

    # masthead — bone with cobalt accent line
    d.rectangle([0, 0, W, 42], fill=(235, 230, 216))
    d.rectangle([0, 42, W, 43], fill=LINE_A)
    d.ellipse([50, 18, 58, 26], fill=(58, 122, 71))
    d.text((68, 14), 'vol. iv · no. 4 · ', font=fonts['mono_sm'], fill=FG_DIM)
    lead_w = fonts['mono_sm'].getlength('vol. iv · no. 4 · ')
    d.text((68 + lead_w, 14), 'portfolio · cobalt ed.', font=fonts['mono_sm'], fill=ACCENT)
    d.text((W - 310, 14), 'jamnapaar 23:47   brooklyn 14:17', font=fonts['mono_sm'], fill=FG_DIM)

    PX = 80
    PY = 92

    d.text((PX, PY), kicker, font=fonts['mono_sm'], fill=FG_DIM)

    y1 = PY + 44
    d.text((PX, y1), title, font=fonts['serif_lg'], fill=FG)
    y2 = y1 + 92
    d.text((PX, y2), accent_word, font=fonts['serif_it'], fill=ACCENT)
    y3 = y2 + 92
    d.text((PX, y3), tail, font=fonts['serif_lg'], fill=FG)

    y4 = y3 + 106
    max_sub_w = W - 2 * PX
    sub = subtitle
    if fonts['serif_md'].getlength(sub) > max_sub_w:
        while fonts['serif_md'].getlength(sub + '…') > max_sub_w and len(sub) > 4:
            sub = sub[:-1]
        sub = sub + '…'
    d.text((PX, y4), sub, font=fonts['serif_md'], fill=FG_MUTED)

    # bottom bar
    d.rectangle([0, H - 48, W, H - 47], fill=LINE_A)
    d.rectangle([PX, H - 32, PX + 220, H - 29], fill=ACCENT)
    d.text((PX, H - 22), stack_l, font=fonts['mono_sm'], fill=FG_DIM)
    stack_r_w = fonts['mono_sm'].getlength(stack_r)
    d.text((W - 80 - stack_r_w, H - 22), stack_r, font=fonts['mono_sm'], fill=FG_DIM)

    img.save(out_path, optimize=True)
    print(f'{out_path} → {os.path.getsize(out_path)}b')

def main():
    fonts = load_fonts()
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'og')
    os.makedirs(out_dir, exist_ok=True)
    only = set(sys.argv[1:])
    for row in CASES:
        slug = row[0]
        if only and slug not in only:
            continue
        draw_case(*row, fonts=fonts, out_path=os.path.join(out_dir, f'{slug}.png'))

if __name__ == '__main__':
    main()
