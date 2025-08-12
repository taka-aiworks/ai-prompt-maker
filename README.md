# AI Prompt Generator Web App

This is a web-based prompt generation tool designed for AI image creation workflows.  
It allows you to input key attributes (character, clothing, colors, styles, etc.) and outputs ready-to-use prompts for major AI platforms.

## Features
- Multi-field prompt customization (hair, eyes, clothing, background, style, etc.)
- Preset save/load functionality in browser localStorage
- Tag search for saved prompts
- Output prompt format switching per platform (e.g., Midjourney, Stable Diffusion, AniFusion)
- Optional GAS integration for saving prompts to Google Sheets
- Works entirely in browser; no backend server required

## Directory Structure

/ (root)
├── index.html          # Main application HTML
├── css/
│   └── style.css       # Stylesheet
├── js/
│   └── main.js         # Main app logic
└── assets/
└── (images/icons)  # Optional UI images

## How to Run Locally
1. Download or clone this repository.
2. Open `index.html` in your browser.
3. No installation required.

## Deploy on GitHub Pages
1. Fork this repo.
2. Go to **Settings > Pages**.
3. Select branch: `main` and root folder `/`.
4. Your app will be live at: `https://<your-username>.github.io/<repo-name>/`.

## Optional: Link with Google Sheets via GAS
1. Create a Google Apps Script project.
2. Paste the provided `.gs` file code.
3. Deploy as Web App (**accessible to anyone with link**).
4. Copy the Web App URL and paste into the app’s `GAS Web App URL` field.