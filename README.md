# Victoria University Tower Navigator

A responsive, static campus-navigation website for Victoria University's Market Plaza Tower in Kampala, Uganda. It helps students, staff, and visitors find rooms and facilities, explore floor information, and follow room directions.

**Live website:** https://jeiso-n.github.io/victoria-university-navigator/

## Features

- **Floor selector:** Browse the building from Basement 2 (B2) through Floor 9.
- **Room directory:** Browse rooms and offices, including an alphabetical index and room selection controls.
- **Room search:** Search for a room by its number or name from the site navigation.
- **Floor pages:** Open individual floor pages with floor information and available floor-plan graphics.
- **Directions:** View room locations and written directions from the Rooms & Directions page.
- **Facilities:** Explore campus facilities and their information.
- **New Student Guide:** A dedicated starting point for students who are new to the building.
- **Room photographs:** View photographs associated with selected rooms and facilities.
- **Responsive interface:** Navigate the site on desktop and mobile screens.

## Getting Started

### Use the live website

Open [Victoria University Tower Navigator](https://jeiso-n.github.io/victoria-university-navigator/) in a modern web browser.

### Run locally

The project is a static website. It does not require Node.js, npm, a database, Docker, or a backend server.

1. Download or clone this repository.
2. Open the project folder.
3. Open `index.html` in a modern browser such as Chrome, Edge, or Firefox.

You can also serve the folder with any simple local static-file server if you prefer, but it is not required for basic use.

## Website Pages

| Page | Description |
| --- | --- |
| `index.html` | Home page and building floor selector |
| `directions.html` | Main room directory, search/index controls, and directions |
| `facilities.html` | Campus facilities |
| `new-student-guide.html` | Guide for new students |
| `about.html` | Project information |
| `floors/index.html` | Floor directory |
| `floors/floor-*.html` | Individual floor pages |

The floor pages cover Basement 2, Basement 1, Ground Floor, and Floors 1–9.

## Project Structure

```text
victoria-university-navigator/
├── .github/
│   └── workflows/
│       └── deploy-pages.yml   # GitHub Pages deployment workflow
├── css/
│   └── style.css              # Site styling and responsive layouts
├── floor plan SVG_s/          # Source SVG floor-plan files
├── floors/
│   ├── *.html                 # Individual floor pages
│   └── *.svg                  # Floor-plan graphics used by the site
├── images/                    # University logo, room and facility photos
├── js/
│   └── script.js              # Room data and interactive site behaviour
├── about.html
├── directions.html
├── facilities.html
├── index.html
├── new-student-guide.html
├── favicon.svg
├── favicon.ico
├── favicon-16.png
├── favicon-32.png
├── favicon-48.png
└── apple-touch-icon.png
```

The repository also contains `campus.blend`, a Blender 3D project file with building/floor models. It is a source asset and is not required to browse the current static website.

## Technologies

- HTML5
- CSS3
- Vanilla JavaScript
- SVG floor-plan graphics
- GitHub Pages for hosting and deployment

There is no build step or package installation for the current website.

## Deployment

The website is published using GitHub Pages. The workflow at `.github/workflows/deploy-pages.yml` runs when changes are pushed to the `main` branch (and can also be started manually from GitHub Actions).

To publish an update:

1. Make and test your changes locally.
2. Commit and push the changes to `main`.
3. Open the repository's **Actions** tab and check the **Deploy Victoria University Navigator to GitHub Pages** workflow.
4. Once the workflow succeeds, the updated site is available at https://jeiso-n.github.io/victoria-university-navigator/.

The deployment workflow prepares the static site and excludes development/source-only files such as the Blender model and project report from the published website.

## Requirements

- A modern web browser.
- Internet access to open the hosted version. The downloaded static files can be opened locally; some browser restrictions may apply to browser features that fetch local resources.

No Java, Docker, database, Node.js, or development environment is needed by a visitor using the website.

## Project Credits

- **Student:** Muganzi Joel (VU-CSF-2603-1860-DAY)
- **Supervisor:** Mr. Sebastian Lutaalo
- **Institution:** Victoria University

## Notes

Room names, room assignments, photographs, and directions should be checked against current university information. Building arrangements can change, so visitors should confirm important locations with university staff when necessary.

The Blender models are retained as project source material for possible future 3D navigation integration.
