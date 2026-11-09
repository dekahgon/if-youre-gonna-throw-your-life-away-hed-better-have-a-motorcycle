# Marvel Network Website — Build Spec

Nov 9, 2026 · @Andrea

## 0. How to use this spec

This is the build spec for a website that helps my friends understand the network of characters in the Marvel movies. It will be used as a tool in my Digital Humanities tutorial session at Minerva University on 19 November 2026, on small-world networks.

**Instructions for the model building the site:**

1. Read the whole spec before writing any code.
2. Before building, ask **at least 5 clarifying questions** about anything not mentioned or specified. Section 9 records decisions already made; don't ask about those again.
3. **Writing beats drawings.** If the written spec and the hand-drawn sketches disagree, follow the writing. Known conflicts are resolved in section 8.
4. **Text marked VERBATIM must be copied word for word.** Only lines in ITALIC CAPS are instructions and are not copied.
5. Follow the design very closely. It is intentionally specific.

**Site map (4 pages + landing):**

| Order | Page | Purpose |
| --- | --- | --- |
| 0 | Landing | Full-screen welcome image; click anywhere to enter |
| 1 | Network | The interactive character network (main page) |
| 2 | Saved networks | Grid of networks the user saved |
| 3 | Data collection | How the data was gathered + download of the data files |
| 4 | About | Who made this and why, plus the required readings |

## 1. Global design rules (apply to every page)

The whole site is black and white, very simple, with no fancy animations.

**Colour**

- Everything is black on a white background.
- **No gradients, no blur/obfuscation, no shadows, no decorative effects.**
- The only exceptions:
  - **Hyperlink blue** (classic HTML link blue, e.g. `#0000EE`) for hovered/active menu items, links and the selected phase.
  - **Grey** where explicitly stated: disabled buttons, dates on saved-network cards, faded nodes during hover highlight.
  - **Blue star and red star** on the timeline slider.
  - The **character pictures**, which are in colour.
  - The **landing-page button**, which is deliberately colourful and blinking (section 3).

**Typography**

- One font for the whole site, including the menu: **Courier New** (monospace), e.g. `font-family: "Courier New", Courier, monospace;`
- Text is black.
- **Desktop only.** The site will not be used on mobile or small screens; no responsive phone layout is needed.

**Lines**

- All separators are **thin black lines** of the same thickness (e.g. 1px).

**Top menu (on every page except the landing page)**

- Centred at the top of the page.
- Items, in this order, separated by vertical bars:

```
network | saved networks | data collection | about
```

- Each item links to its page.
- Style: classic HTML link behaviour. Black by default; turns **hyperlink blue and underlined** when hovered, and stays blue and underlined for the page the user is currently on.
- Below the menu: one **thin black horizontal line** across the full width, separating the menu from the rest of the screen.

## 2. Files and assets

All images and the three CSV files will be provided in one project folder. The network is built entirely from the CSVs.

**Folder structure**

```
marvel-network/
├── SPEC.md                      (this document, exported)
├── data/
│   ├── movies.csv
│   ├── characters.csv           (includes wikipedia_url and image columns)
│   └── appearances.csv
└── images/
    ├── landing.png              (confirmed file name)
    └── characters/
        ├── tony_stark.png       (file name = character id)
        ├── steve_rogers.png
        └── ...
```

**Data tables**

1. `movies.csv` — one row per film.

```csv
id,title,release_date,phase
iron_man,Iron Man,2008-05-02,1
avengers,The Avengers,2012-05-04,1
civil_war,Captain America: Civil War,2016-05-06,3
```

2. `characters.csv` — one row per character.

```csv
id,name,alias,wikipedia_url,image
tony_stark,Tony Stark,Iron Man,https://en.wikipedia.org/wiki/Iron_Man,tony_stark.png
steve_rogers,Steve Rogers,Captain America,https://en.wikipedia.org/wiki/Captain_America,steve_rogers.png
natasha_romanoff,Natasha Romanoff,Black Widow,https://en.wikipedia.org/wiki/Black_Widow_(Natasha_Romanoff),natasha_romanoff.png
```

3. `appearances.csv` — one row per character per movie. This is the important one.

```csv
character_id,movie_id
tony_stark,iron_man
tony_stark,avengers
steve_rogers,avengers
natasha_romanoff,avengers
```

**How the network is derived**

- **Node** = a character.
- **Edge** = two characters who appear together in at least one movie.
- **Edge weight** = number of movies they appear in together. Each edge also stores the list of those movies (title + release year) for the hover box.
- Movies included = those whose `release_date` falls inside the timeline selection.
- Data rules: UTF-8, comma-separated, header row, ids in lowercase snake\_case, dates as YYYY-MM-DD, every id in `appearances.csv` must exist in the other two files.

**Character pictures**

- One PNG per character, already provided, named as in the `image` column of `characters.csv`.
- **Every character has a picture and every id exists in all files.** No data checks or missing-picture fallback are needed.
- The site crops the pictures into circles with CSS.

**Hosting**

- A **static site** (plain HTML, CSS and JavaScript, with D3.js for the network) deployed on **Vercel**. No server or database: the CSVs and images are loaded as static files.

## 3. Page 0 — Landing page

The first thing people see is a full-screen image; they click anywhere to enter the Network page.

- **Image:** `images/landing.png`. Proportions of a computer screen, roughly 1920×1080.
- **Always centred.** The middle of the image holds a rainbow with the text "welcome to my Marvel network". However the window is resized, the centre of the image must stay in view (e.g. `object-fit: cover; object-position: center`).
- **No timer.** Do not auto-advance after 3 seconds; wait for the user to click.
- **Click prompt:** a sparkly button centred at the bottom of the page. Exact text, with these symbols before and after:

```
⋆˙⟡ click to move to the next page ⋆˙⟡
```

- **Button style (the one exception to black-and-white):** it blinks — show up, disappear, show up, disappear — and cycles through **bright yellow, bright green and bright blue**. It is meant to be a bit ugly, like an old 1990s web page. It appears quickly once the page loads.
- **Clicking anywhere on the screen** (not only the button) goes to the Network page.
- No menu on this page.

## 4. Page 1 — Network

The Network page is split by a thin vertical line in the golden ratio: the network on the left (about 61.8%), the controls panel on the right (about 38.2%).

### 4.1 Layout

```
                 network | saved networks | data collection | about
──────────────────────────────────────────────────────────────────────────────
━━ thickness = number of movies     │ [timeline]                              
   together                         │ ★━━━━━━━━━━━━━━━━━━━━━━━━★      [▷] [↻]
                                    │ 2008                      2026          
        (face)                      │─────────────────────────────────────────
          \      (face)             │ [measurements]                          
           \    /                   │ |                                       
           (face)                   │ |— clustering:                          
                                    │ |— global efficiency:                   
   NETWORK  (~61.8%)                │ ...                                     
                                    │─────────────────────────────────────────
                                    │ [editing mode]   [reset] [generate random] [save current network]
                                    │ [movies add/remove] ...                 
                                    │ [characters add/remove] ...             
                                    │ (currently shown) ...       (~38.2%)    
```

- Left and right areas are separated by a **thin black vertical line**.
- The three sections of the right panel (timeline, measurements, editing mode) are separated by **thin black horizontal lines**.
- Section titles in the right panel are written in square brackets: `[timeline]`, `[measurements]`, `[editing mode]`.

### 4.2 Left: the network

**Nodes**

- Each node is a **picture of the character's face** (circular).
- Characters not connected to the main body of the network are **still displayed**. The network does not need to be one connected graph; isolated characters and separate clusters all appear.

**Layout behaviour**

- Force-directed layout with **draggable nodes**.
- The layout is **stable**: existing nodes do not jump around when movies or characters are added or removed; new nodes settle in near their neighbours.
- **Isolated nodes must always stay on screen** (keep every node inside the visible network area).

**Hover highlight**

- Hovering a character keeps that character, its direct neighbours and the edges between them in full colour/black, and fades everything else to grey (flat grey, no gradient). Moving the mouse away restores the network.

**Edges**

- **Black lines** connecting characters who appeared in a movie together.
- **Thickness is proportional to the number of movies together**: thin for 1 movie, getting progressively thicker for more, up to a maximum thickness (builder's discretion).
- **Legend** in the top-left corner of the network area: a small caption showing a thin and a thick line and explaining that edge thickness is proportional to the number of movies together.

**Hover on a node (character)**

- A small **rectangular box** pops up with a **V-shaped pointer** pointing at the character's face, like a cartoon speech balloon (but rectangular, not round).
- It shows the **character's name** followed by an **"open in new page" icon** (the external-link icon).
- **Clicking the box** opens the character's **Wikipedia page in a new tab**.

**Hover on an edge**

- A similar **rectangular box with a V pointer** pointing at the hovered edge (box, not round balloon).
- It lists **every movie counted in that edge**, each with its **release year**, e.g.:

```
movie 1 (2008)
movie 2 (2010)
movie 3 (2012)
```

### 4.3 Right: \[timeline\]

The timeline lets the user choose which period of movies the network displays.

- A thin rectangle (range slider). Label **2008** at the bottom left and **2026** at the bottom right.
- Two draggable stars:
  - **Blue star** = start of the period (left handle).
  - **Red star** = end of the period (right handle).
- The space **between the stars is hatched** (diagonal lines).
- Example: blue star at 2008 and red star at 2016 shows only movies released from 2008 to 2016.
- The network, measurements and editing panel update to match the selected period.

**Granularity:** the slider moves in **whole years** (2008, 2009 … 2026).

**\[phase\] selector** (directly under the slider, still inside the timeline section)

```
[phase]
[1] [2] [3] [4] [5] [6]
```

- Clicking a phase shows **all the movies of that Marvel phase** (from the `phase` column in `movies.csv`) and moves the stars to that phase's first and last release years.
- The selected phase is shown in hyperlink blue and underlined; moving the stars by hand clears the phase selection.
- The list of phases comes from the data, so new phases appear automatically.

**Play button** (right of the slider)

- A **black-outline square with a black-outline triangle** inside; transparent/white fill, outlines only.
- On click: the network is erased, then movies from the selected period are added **movie by movie** (not year by year), in release order, one second apart. The first movie appears with its characters and connections (often just two characters), then the second movie's characters and connections are added a second later, then the third, and so on.
- This builds an animation of when each character joined the network.
- No extra play controls (no pause, no movie caption) — just this button.

**Reset button** (right of the play button)

- A **black-outline square with a black restart symbol** inside.
- Resets the timeline to the whole range (blue star at 2008, red star at 2026) and shows the full network.

### 4.4 Right: \[measurements\]

The measurements list shows live network metrics and is recalculated whenever the network changes (timeline, add/remove, editing, random).

**Format — follow this example closely (one vertical line only):**

```
[measurements]
|
|— item:
|
|— item:
|
|— item:
|
|— item:
```

**Items to show:**

1. clustering
2. global efficiency
3. local efficiency
4. number of nodes
5. number of edges
6. density
7. average shortest path length
8. number of connected components
9. small-world coefficient (σ)

More metrics may be added later, so the list must be easy to extend.

**Weighted metrics.** Metrics use the **edge weight w\_ij = number of movies characters i and j appear in together**, the same value that sets line thickness. For anything based on distance (efficiency, path length), an edge's length is **1 / w\_ij**: characters who share more movies are "closer". Number of nodes, number of edges, density and connected components only depend on whether an edge exists.

**Definitions on hover.** Hovering a metric name shows a small rectangular box (same style as the network boxes) with a two-sentence definition and its formula, written as plain monospace text. Notation: n = number of nodes, m = number of edges, k\_i = degree of node i, d\_ij = shortest-path distance between i and j.

| Metric | Two-sentence definition (shown on hover) | Formula |
| --- | --- | --- |
| clustering | How often a character's co-stars have also appeared with each other, giving more weight to pairs who share many movies. It averages, over all characters, how strongly the triangles around them are actually filled in. | C = (1/n) Σ\_i \[1 / (k\_i(k\_i − 1))\] Σ\_{j,k} (ŵ\_ij · ŵ\_ik · ŵ\_jk)^(1/3), ŵ = w / max(w) |
| global efficiency | How easily information could travel across the whole network, where strong ties (many shared movies) count as shorter links. It averages the inverse weighted distance between every pair of characters, so unreachable pairs count as 0. | E\_glob = 1/(n(n − 1)) Σ\_{i≠j} 1/d\_ij, d\_ij = shortest path with edge length 1/w |
| local efficiency | How well a character's neighbours stay connected, through strong ties, if that character is removed. It is the weighted global efficiency of each character's neighbourhood, averaged over all characters. | E\_loc = (1/n) Σ\_i E\_glob(G\_i), G\_i = subgraph of i's neighbours |
| number of nodes | The number of characters currently shown. Isolated characters are included. | n |
| number of edges | The number of pairs of characters who share at least one movie. Each pair counts once, however many movies they share. | m |
| density | The share of all possible connections that actually exist. 1 means every character has appeared with every other one. | D = 2m / (n(n − 1)) |
| average shortest path length | The average weighted distance between two characters, where sharing more movies makes a link shorter. It is computed inside the largest connected component, since unreachable pairs have no distance. | L = 1/(n\_c(n\_c − 1)) Σ\_{i≠j} d\_ij, edge length 1/w, over the largest component of n\_c nodes |
| number of connected components | How many separate groups the network breaks into. An isolated character counts as a group of its own. | count of maximal connected subgraphs |
| small-world coefficient (σ) | Compares the network with random networks of the same size, number of edges and edge weights. A value above 1 means it is a small world: much more clustered than random, with similarly short paths. | σ = (C / C\_r) / (L / L\_r), C\_r and L\_r = averages over 10 random graphs with the same n and m and the real weights shuffled onto the edges (largest component) |

If a metric cannot be computed (e.g. fewer than 2 nodes, or σ when k̄ ≤ 1), show `—`.

### 4.5 Right: \[editing mode\]

Editing mode lets users change the network temporarily; changes do not alter the source data.

**Header line**

- `[editing mode]` aligned left.
- On the same line, aligned right, three text buttons in brackets:
  1. **\[reset\]** — resets the network to its original state: all characters and all movies for the currently selected timeline.
  2. **\[generate random\]** — randomises which characters appear on screen: it picks a random subset of characters (random size) and shows them with all their real connections from the movies in the selected timeline.
  3. **\[save current network\]** — saves whatever network is currently displayed on the left to the Saved networks page.

**\[movies add/remove\]**

- A search box. As the user types a movie title, results appear below like a normal search engine: the movie on the first line, and on the second line the characters in that movie.
- Clicking a result puts that movie in the search bar.
- To the right of the search bar there are always two buttons: **add** and **remove**.
  - If the movie is **already in the network**: add is greyed out (not clickable), remove is clickable.
  - If the movie is **not in the network**: add is clickable, remove is greyed out.
- Clicking the active button adds or removes that movie's characters and connections from the network.

**\[characters add/remove\]**

- Same structure as movies, but for characters (nodes).
- Removing a character removes its node and all its edges. Adding a character adds it back with its edges.

**(currently shown)**

- Below the characters section, titled `(currently shown)`, with the hint "double click to edit".
- A list of **all movies currently in the network**, each as a small box with:
  - the movie title,
  - its release date,
  - the characters who appear in it, shown as **tags**.
- **Double-clicking a movie** puts it in editing mode. The user can then remove a character from that movie, e.g. pretend Spider-Man was never in Captain America: Civil War, and the corresponding edges disappear.
- These edits are temporary. They are kept only by clicking \[save current network\], which stores them on the Saved networks page.

## 5. Page 2 — Saved networks

Saved networks appear as a grid of identical cards, three per row, centred under the menu.

- Same top menu and horizontal line as every page.
- **Grid:** X rows × 3 columns, however many networks the user has saved.
- **Card:** a rectangle in **4:3 proportion** with a thin black outline.
  - **Top three-quarters:** a miniature of the saved network (faces and edges as on the Network page).
  - **Bottom quarter:** separated from the top by a thin black line of the same thickness as the card outline. Inside it:
    - `saved network #1` (#2, #3… the number of that save),
    - below it, the **date it was saved** in a lighter shade of grey,
    - a small text button **\[delete\]** that removes that saved network (ask "delete saved network #N?" before deleting).
- Every card follows the same pattern.
- **Clicking a card** (anywhere except \[delete\]) reopens that network on the Network page, exactly as it was saved.

**What a save stores**

- Timeline range (blue and red star years) and selected phase, if any.
- Movies and characters removed or added.
- Per-movie edits made in (currently shown), e.g. a character removed from one movie.
- Node positions, so the reopened network and the miniature look the same as when saved.
- Save number and date.

**Storage:** saves live **only in each visitor's own browser** (`localStorage`). Nothing is shared between visitors; clearing browser data removes them.

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   (mini      │  │              │  │              │
│   network)   │  │              │  │              │
│              │  │              │  │              │
├──────────────┤  ├──────────────┤  ├──────────────┤
│saved network #1│ │              │  │              │
│09/11/2026    │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

## 6. Page 3 — Data collection

The Data collection page is plain text with the same look as the About page, followed by a download button.

**Layout:** same menu; text centred in a column with wide margins on both sides; line spacing 1.5.

**VERBATIM TEXT — copy word for word:**

> Most of the data used to make this network came from the official Marvel website. I put together a list of characters and character appearances for each of the 38 Marvel movies released up to date (9 November 2026). Most of the films on the Marvel website have a description of the main characters, so I took all the heroes from there, excluding all the villains. Some of the movies didn’t have that description, in which case I relied either on my own knowledge of the movies, having watched them, or on a quick search online, looking at the cast on IMDb.
>
> At some points I had to use my own discretion. There were moments where I wasn’t sure whether a character would be considered a hero, and moments where a character’s appearance was so short that it didn’t feel worth including. For example, I left out Thor’s appearance in Doctor Strange and Doctor Strange’s appearance in the Thor movies, because those take place in post-credits scenes. I decided to add Loki and Hawkeye when they appear in the Thor movies, but I removed Odin, Heimdall and Dr. Erik Selvig, as these are not well-known Marvel characters by any metric. I included the Wasp in all the movies where she shows up, even if briefly, and I did not include Okoye in the Black Panther movies because, at my discretion, she is not a main character. I also skipped over Melina in Black Widow. Deadpool & Wolverine had multiple cameos that I chose to simplify, so I removed four characters: Johnny Storm, Elektra Natchios, Blade and Gambit. I did, however, include X-23 (Laura Kinney).
>
> Source: [Marvel website](https://www.marvel.com/movies)

*HERE THERE WILL BE A BUTTON TO DOWNLOAD THE FILES USED TO MAKE THE NETWORK* — the button downloads `movies.csv`, `characters.csv` and `appearances.csv` (suggested: as one .zip).

## 7. Page 4 — About

The About page is plain written text, centered with wide side margins and 1.5 line spacing.

**VERBATIM TEXT — copy word for word:**

> This website was created as a tool for my tutorial session in the Digital Humanities course at Minerva University. On 19 November 2026, I will be talking about small-world networks and their power in literary research and, more broadly, as a storytelling tool. The required readings for this session are as follows:
>
> *(INCLUDE READINGS)*
>
> This website was made by Andrea Garcia Massukado. For any questions, contact me at garcia@uni.minerva.edu.

The email address should be a `mailto:` link.

## 8. Conflicts resolved (writing wins)

Where the sketches and the transcript disagree, the build follows the transcript.

| Topic | Sketch shows | Build follows |
| --- | --- | --- |
| Menu order | network \| data collection \| about \| saved networks | network \| saved networks \| data collection \| about |
| Edge colour | Red lines | Black lines |
| Timeline label | `[global measurements]` crossed out, `[timeline]` | `[timeline]` |
| Measurements tree | Separate vertical dashes per item; "edges" in a second column | One continuous vertical line, one item per row |
| Landing page | — | Click to continue; no 3-second auto-advance |
| Movies section label | `[add/rm movie]` | `[movies add/remove]` |
| Saved-network date | "date saved" in pencil | Date in lighter grey |
| Where edits are saved | Transcript said "data collection section" (typo) | Saved networks page |

## 9. Decisions log

These questions are settled; the spec above already reflects them, so the builder should not ask about them again.

| Topic | Decision |
| --- | --- |
| Landing image | `images/landing.png` |
| Font | Courier New (monospace) |
| Screens | Desktop only; no mobile layout |
| Hosting | Static site on Vercel |
| Data | All ids exist in all files; every character has a picture and a `wikipedia_url`. No data checks or fallbacks |
| Phase selector | `[phase]` with `[1]`…`[6]` under the timeline, filters by the `phase` column |
| Timeline granularity | Yearly slider; play animation goes movie by movie |
| Play controls | Only the play button; no pause or caption |
| Generate random | Random subset of characters, with their real connections |
| Metrics | Weighted by number of movies together (distance = 1/weight), matching edge thickness |
| Small-world metrics | Density, average shortest path length, connected components, small-world coefficient σ added |
| Metric definitions | Hover shows a two-sentence definition and formula |
| Hover highlight | Yes: hovered character + neighbours stay, the rest fades to grey |
| Layout | Draggable nodes, stable layout, isolated nodes always on screen |
| Saved networks storage | Each visitor's own browser (`localStorage`) |
| Save contents | Everything: timeline range, phase, removed/added movies and characters, per-movie edits, positions |
| Saved card click | Reopens the network on the Network page |
| Delete | \[delete\] on each saved card |
| Sparkly button | Blinking, bright yellow / green / blue, deliberately a bit ugly, with ⋆˙⟡ before and after the text |

**Still to add before launch**

- [ ] Required readings for the About page.
