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

    for (const url of urls) {
        try {
            await page.goto(url, { waitUntil: 'networkidle2' });

            const data = await page.evaluate(() => {
                const h1Text = document.querySelector('h1')?.innerText || '';
                const h2Text = document.querySelector('h2')?.innerText || '';
                let author = '';
                let description = '';

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

                const genderExceptions = ["Basculegion", "Indeedee", "Meowstic", "Oinkologne"];

                document.querySelectorAll('article').forEach(article => {
                    const pre = article.querySelector('pre');
                    if (!pre) return;

                    if (pre.innerHTML.includes('<span class="attr">EVs: </span>')) hasEVs = true;

                    const firstLineHtml = (pre.innerHTML.split('\n')[0] || '').trim();
                    if (!firstLineHtml) return;

                    const tmp = document.createElement('div');
                    tmp.innerHTML = firstLineHtml;

                    let species = null;
                    const spans = tmp.querySelectorAll('span');
                    for (const s of spans) {
                        const cls = s.className || '';
                        if (cls.split(/\s+/).some(c => c.startsWith('type-'))) {
                            species = s.textContent.trim();
                            break;
                        }
                    }

                    if (!species) {
                        species = (tmp.textContent || '').split('@')[0].trim();
                        const parMatch = species.match(/\(([^)]+)\)/);
                        if (parMatch && parMatch[1].trim()) {
                            species = parMatch[1].trim();
                        }
                    }
                    if (!species) return;

                    species = species.replace(/\s*\([MmFf]\)\s*$/, '').trim();

                    // Detect gender
                    let isFemale = false;
                    const genderSpan = article.querySelector('span.gender-f, span.gender-m');
                    if (genderSpan && genderSpan.classList.contains('gender-f')) {
                        isFemale = true;
                    } else if (!genderSpan) {
                        const firstLineText = (pre.innerText.split('\n')[0] || '');
                        const gm = firstLineText.match(/\(\s*([Ff])\s*\)/);
                        if (gm) isFemale = true;
                    }

                    // Gender logic:
                    // Default → strip gender entirely
                    // Exceptions → keep -f suffix when female
                    if (isFemale && genderExceptions.includes(species)) {
                        species = `${species}-f`;
                    }

                    // Special Kommo-o case
                    if (/^Kommo-?o$/i.test(species)) {
                        species = 'Kommoo' + (isFemale && genderExceptions.includes('Kommoo') ? '-f' : '');
                    }

                    pokemon.push({ species });
                });

                return { author, description, pokemon, hasEVs, format };
            });

            results.push({ ...data, url });
            console.log(`Scraped: ${url}`);
        } catch (err) {
            console.error(`Error scraping ${url}`, err);
        }
    }

    await browser.close();

    fs.writeFileSync('pastes.json', JSON.stringify(results, null, 2), 'utf-8');
    console.log(`Scraped ${results.length} team${results.length === 1 ? '' : 's'}`);
})();
