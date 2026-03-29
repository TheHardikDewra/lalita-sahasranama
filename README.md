# Sri Lalita Sahasranama

Interactive guide to the 1000 sacred names of the Divine Mother Lalita Tripurasundari - built for seekers learning to chant and understand the Lalita Sahasranama Stotra.

**Live site**: [hardikdewra.github.io/lalita-sahasranama](https://hardikdewra.github.io/lalita-sahasranama/)

## What's inside

- **1000 divine names** with Sanskrit (Devanagari), IAST transliteration, and English meanings
- **915 detailed commentaries** sourced from [Om Swami Ji's](https://t.me/OmSwamiJi) Telegram community
- **182 verses** - the full stotra arranged verse-by-verse for chanting practice
- **5 dhyana (meditation) verses** with translations
- **Flashcard practice mode** - Sanskrit-to-Meaning and Meaning-to-Sanskrit, with 18 verse-range scopes
- **Progress tracking** - mark names as learned, saved in your browser (localStorage)
- **Search** - find any name by Sanskrit, transliteration, meaning, or number
- **Telegram links** for 917 names pointing to detailed posts with pronunciation and scriptural references

## Features

### Home
Stats dashboard, daily name, expandable dhyana verses, quick navigation.

### Names
Browse all 1000 names with search, range filters (1-100, 101-200, etc.), and learned/unlearned filtering. Click any name to expand and see the full commentary, mantra, verse context, and Telegram link.

### Verses
Navigate verse-by-verse through all 182 slokas. Each verse shows the full Devanagari text with individual name breakdowns. Mark entire verses as learned.

### Practice
Flashcard mode with two directions (Sanskrit-to-Meaning, Meaning-to-Sanskrit). Filter by verse range or unlearned names. Keyboard shortcuts: Space to flip, G for "got it", R for "review again".

## Data sources

- **Names, transliterations, meanings**: Extracted from structured Obsidian notes based on traditional commentaries
- **Verse structure**: Parsed from the original stotra text (Brahmanda Purana, Uttara Khanda - dialogue between Sri Hayagriva and Agastya)
- **Detailed commentary**: Exported from the "Sri Lalita Sahasranama" topic in the Om Swami Ji Telegram community (4973 messages, 915 name posts)
- **Dhyana verses**: From the stotra preamble with IAST transliteration and English translation

## Tech

Pure vanilla HTML/CSS/JS - no frameworks, no build step. Works offline once loaded. Data embedded in `data.js`.

- Fonts: Haffer (local), Geist, Inter for body text; Tiro Devanagari Sanskrit for Sanskrit headings
- Dark theme, flat design, mobile responsive
- Progress persisted in localStorage

## Running locally

Just open `index.html` in a browser, or:

```bash
python3 -m http.server 9000
# then visit http://localhost:9000
```

## Source text

The Sri Lalita Sahasranama is from the Brahmanda Purana. The stotra was narrated by Sri Hayagriva to Sage Agastya. It contains 1000 names of the Divine Mother arranged in 182 slokas, preceded by dhyana verses for meditation.

This project is a devotional offering to Maa Lalita Tripurasundari.
