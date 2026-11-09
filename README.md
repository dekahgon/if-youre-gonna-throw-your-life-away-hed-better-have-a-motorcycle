# Marvel network

Static website (HTML, CSS, JavaScript + D3) for the Digital Humanities tutorial on small-world networks.
No build step: deploy this folder to Vercel as it is.

## Pages

| File | Page |
| --- | --- |
| `index.html` | Landing page |
| `network.html` | The interactive network |
| `saved.html` | Saved networks (stored in each visitor's browser) |
| `data.html` | Data collection + zip download of the three CSVs |
| `about.html` | About (the readings go where it says `READINGS`) |

## Updating the data

Edit the three files in `data/`. Comma- or semicolon-separated both work, and dates can be
`YYYY-MM-DD` or `DD/MM/YY`. The site, the phase buttons, the timeline and the zip download all
update automatically.

## Character pictures

The site shows the small copies in `images/faces/` (about 30 KB each) instead of the
originals in `images/characters/` (2–5 MB each), so the page loads quickly. When you add a
character, put the full picture in `images/characters/` and run:

```
pip install pillow
python3 tools/make_faces.py
```

If a small copy is missing, the site falls back to the full picture automatically.

## Local preview

```
python3 -m http.server
```

then open http://localhost:8000. (Opening the HTML files directly by double-clicking will not
load the CSVs; browsers block that.)
