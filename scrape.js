// scrape.js
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Read URLs from pastes.txt
const txtPath = path.resolve(__dirname, 'pastes.txt');
const urls = fs.readFileSync(txtPath, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const results = [];

    const genderExceptions = ["Basculegion", "Indeedee", "Meowstic", "Oinkologne"];

    for (const url of urls) {
        try {
            await page.goto(url, { waitUntil: 'networkidle2' });

            const data = await page.evaluate((genderExceptions) => {
                const h1Text = document.querySelector('h1')?.innerText || '';
                const h2Text = document.querySelector('h2')?.innerText || '';
                let author = '';
                let description = '';

                // Extract author and description
                const splitIndex = h1Text.indexOf("'s ");
                if (splitIndex > -1) {
                    author = h1Text.slice(0, splitIndex).trim();
                    description = h1Text.slice(splitIndex + 3).trim();
                } else {
                    if (h2Text) author = h2Text.replace(/^\s*by\s*/i, '').trim();
                    description = h1Text.trim();
                }

                // Extract format if present
                let format = '';
                const formatEl = Array.from(document.querySelectorAll('p'))
                    .find(p => /Format:/i.test(p.innerText));
                if (formatEl) {
                    const match = formatEl.innerText.match(/Format:\s*(.+)/i);
                    if (match) format = match[1].trim();
                }

                let hasEVs = false;
                const pokemon = [];

                document.querySelectorAll('article').forEach(article => {
                    const pre = article.querySelector('pre');
                    if (!pre) return;

                    if (pre.innerHTML.includes('<span class="attr">EVs: </span>')) hasEVs = true;

                    // Split pre text into lines and remove empty lines
                    const lines = pre.innerText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

                    let currentPokemonText = [];
                    lines.forEach((line, index) => {
                        currentPokemonText.push(line);

                        // If next line starts a new Pokémon (contains '@') or this is the last line
                        const nextLine = lines[index + 1] || '';
                        if (nextLine.includes('@') || index === lines.length - 1) {
                            let firstLineText = currentPokemonText[0];

                            // Species is before '@'
                            let species = firstLineText.includes('@')
                                ? firstLineText.split('@')[0].trim()
                                : firstLineText;

                            // Remove gender markers like (M) or (F)
                            species = species.replace(/\s*\([MmFf]\)\s*$/, '').trim();

                            // Remove nickname if format is "Nickname (Species)"
                            const parMatch = species.match(/\(([^)]+)\)/);
                            if (parMatch && parMatch[1].trim()) species = parMatch[1].trim();

                            // Normalize Vivillon forms
                            if (/^Vivillon/i.test(species)) species = 'Vivillon';

                            // Dudunsparce three-segment fix
                            if (species.toLowerCase() === 'dudunsparce-three-segment') species = 'Dudunsparce';

                            // Detect gender
                            let isFemale = false;
                            const genderSpan = article.querySelector('span.gender-f, span.gender-m');
                            if (genderSpan && genderSpan.classList.contains('gender-f')) isFemale = true;
                            else {
                                const gm = firstLineText.match(/\(\s*([Ff])\s*\)/);
                                if (gm) isFemale = true;
                            }

                            // Apply gender exceptions
                            if (isFemale && genderExceptions.includes(species)) {
                                species = `${species}-f`;
                            }

                            pokemon.push({ species });
                            currentPokemonText = []; // reset for next Pokémon
                        }
                    });
                });

                return { author, description, pokemon, hasEVs, format };
            }, genderExceptions);

            results.push({ ...data, url });
            console.log(`Scraped: ${url}`);
        } catch (err) {
            console.error(`Error scraping ${url}`, err);
        }
    }

    await browser.close();

    // Save results to JSON
    const jsonPath = path.resolve(__dirname, 'pastes.json');
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`Scraped ${results.length} team${results.length === 1 ? '' : 's'}`);
})();
