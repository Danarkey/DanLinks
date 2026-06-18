/*************************************************
 * MANUAL CONFIG
 *************************************************/

const DEFAULT_FORMAT = "regma"; // e.g. "regf", "regh", "regi"

const FORMAT_CONFIG = {
    regma: { label: "Regulation M-A", file: "pastesMA.json" },
    regi: { label: "Regulation I", file: "pastesI.json" },
    regh: { label: "Regulation H", file: "pastesH.json" },
    regf: { label: "Regulation F", file: "pastesF.json" },
};

const SPRITE_BASE = "https://play.pokemonshowdown.com/sprites/gen5/";
const MAX_DROPDOWN_RESULTS = 60;

/*************************************************
 * GLOBAL STATE
 *************************************************/

let allPastes = [];
let selectedFormat = "all";
let activeFilters = new Set();
let allPokemonList = [];
const maxFilters = 6;

const loadedKeys = new Set(); // which format files are already fetched + merged

/*************************************************
 * URL HELPERS
 *************************************************/

function getFormatFromURL() {
    const params = new URLSearchParams(window.location.search);
    const format = params.get("format");
    return FORMAT_CONFIG[format] ? format : DEFAULT_FORMAT;
}

function updateURL() {
    const params = new URLSearchParams(window.location.search);
    if (selectedFormat === "all") params.delete("format");
    else params.set("format", selectedFormat);
    window.history.replaceState({}, "", window.location.pathname + (params.toString() ? "?" + params.toString() : ""));
}

/*************************************************
 * DATA LOADING (progressive)
 *************************************************/

// Fetch one format file once and merge its entries into allPastes.
async function fetchFormat(key) {
    if (loadedKeys.has(key)) return;
    const res = await fetch(FORMAT_CONFIG[key].file);
    const data = await res.json();
    allPastes = allPastes.concat(data.map(entry => ({ ...entry, _formatKey: key })));
    loadedKeys.add(key);
}

// Make sure every format needed to render the current view is loaded.
async function ensureFormatLoaded(format) {
    const keys = format === "all" ? Object.keys(FORMAT_CONFIG) : [format];
    await Promise.all(keys.filter(k => !loadedKeys.has(k)).map(fetchFormat));
}

async function loadPastes() {
    selectedFormat = getFormatFromURL();

    populateFormatDropdown();
    initTeamFilter();

    try {
        // 1. Load only what the current view needs, then paint immediately.
        await ensureFormatLoaded(selectedFormat);
        buildPokemonList(allPastes);
        renderTable();

        // 2. Warm the remaining formats in the background so switching is instant
        //    and the search list becomes complete. No blocking the first paint.
        const rest = Object.keys(FORMAT_CONFIG).filter(k => !loadedKeys.has(k));
        if (rest.length) {
            Promise.all(rest.map(fetchFormat)).then(() => {
                buildPokemonList(allPastes);
                if (selectedFormat === "all") renderTable();
            });
        }
    } catch (err) {
        console.error("Error loading paste repositories", err);
    }
}

/*************************************************
 * FORMAT DROPDOWN
 *************************************************/

function populateFormatDropdown() {
    const select = document.getElementById("formatFilter");
    select.innerHTML = `<option value="all">All formats</option>`;

    Object.entries(FORMAT_CONFIG).forEach(([key, cfg]) => {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = cfg.label;
        option.selected = key === selectedFormat;
        select.appendChild(option);
    });

    select.addEventListener("change", async e => {
        selectedFormat = e.target.value;
        updateURL();
        await ensureFormatLoaded(selectedFormat); // no-op if already warmed
        renderTable();
    });
}

/*************************************************
 * TABLE RENDERING
 *************************************************/

const ROW_BATCH = 100; // rows rendered per scroll batch

let filteredPastes = [];   // current result set for the active format + filters
let renderedCount = 0;     // how many of filteredPastes are in the DOM
let rowObserver = null;    // IntersectionObserver that triggers the next batch

function pasteMatches(paste) {
    const matchesFormat = selectedFormat === "all" || paste._formatKey === selectedFormat;
    if (!matchesFormat) return false;
    if (activeFilters.size === 0) return true;
    const rowSpecies = paste.pokemon.map(p => formatSpeciesSlug(p.species));
    return [...activeFilters].every(f => rowSpecies.includes(f));
}

function buildRow(paste) {
    const { author, description, pokemon, url, hasEVs } = paste;
    const teamHTML = pokemon.map(p => {
        const slug = formatSpeciesSlug(p.species);
        return `<img src="${SPRITE_BASE}${slug}.png" alt="${p.species}" title="${p.species}" class="pokemon-icon" data-species="${slug}" loading="lazy" decoding="async" width="40" height="40">`;
    }).join("");

    const evHTML = hasEVs ? `<span class="text-success">&#10003;</span>` : `<span class="text-error">&#10007;</span>`;
    const detailsHTML = `<span class="info-button btn-outline btn-ghost btn-xs btn" data-url="${url}">&#9432;</span>`;

    const row = document.createElement("tr");
    row.innerHTML = `
        <td class="author-col">${author}</td>
        <td class="desc-col">${description}</td>
        <td class="team-cell">${teamHTML}</td>
        <td class="ev-cell">${evHTML}</td>
        <td class="paste-col">${detailsHTML}</td>
    `;
    return row;
}

// Append the next slice of filteredPastes to the table.
function renderNextBatch() {
    const tableBody = document.getElementById("pokeTableBody");
    const fragment = document.createDocumentFragment();
    const end = Math.min(renderedCount + ROW_BATCH, filteredPastes.length);

    for (let i = renderedCount; i < end; i++) {
        fragment.appendChild(buildRow(filteredPastes[i]));
    }
    tableBody.appendChild(fragment);
    renderedCount = end;

    updateTableHighlight();

    // Keep a sentinel just below the last row so the observer can fire again.
    if (renderedCount < filteredPastes.length) positionSentinel();
    else hideSentinel();
}

function positionSentinel() {
    const sentinel = document.getElementById("scrollSentinel");
    if (sentinel) sentinel.style.display = "";
}

function hideSentinel() {
    const sentinel = document.getElementById("scrollSentinel");
    if (sentinel) sentinel.style.display = "none";
}

// Rebuild from scratch for a new format/filter selection.
function renderTable() {
    const tableBody = document.getElementById("pokeTableBody");
    filteredPastes = allPastes.filter(pasteMatches);
    renderedCount = 0;
    tableBody.replaceChildren();
    renderNextBatch();
    window.scrollTo({ top: 0 });
}

// Reveal more rows as the user nears the bottom of the page.
function initInfiniteScroll() {
    const sentinel = document.getElementById("scrollSentinel");
    if (!sentinel || !("IntersectionObserver" in window)) return;

    rowObserver = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting) && renderedCount < filteredPastes.length) {
            renderNextBatch();
        }
    }, { rootMargin: "600px 0px" });

    rowObserver.observe(sentinel);
}

/*************************************************
 * POKÉMON FILTER SUPPORT
 *************************************************/

function buildPokemonList(pastes) {
    const uniquePokemon = new Set();
    pastes.forEach(p => p.pokemon.forEach(mon => uniquePokemon.add(mon.species)));
    allPokemonList = [...uniquePokemon].sort((a, b) => a.localeCompare(b));
}

function updateTableHighlight() {
    document.querySelectorAll('#pokeTableBody .pokemon-icon').forEach(icon => {
        icon.classList.toggle('filter-active', activeFilters.has(icon.dataset.species));
    });
}

function toggleFilter(species) {
    if (activeFilters.has(species)) activeFilters.delete(species);
    else if (activeFilters.size < maxFilters) activeFilters.add(species);
    renderFilterTags();
    renderTable();
}

function renderFilterTags() {
    const container = document.getElementById('selectedPokemonContainer');
    const input = document.getElementById('teamFilterInput');
    container.querySelectorAll('.pokemon-tag').forEach(tag => tag.remove());

    activeFilters.forEach(species => {
        const tag = document.createElement('div');
        tag.className = 'pokemon-tag';
        tag.innerHTML = `<img src="${SPRITE_BASE}${species}.png" loading="lazy" decoding="async" width="40" height="40"><span class="remove-tag">&#10005;</span>`;
        tag.querySelector('.remove-tag').onclick = () => {
            activeFilters.delete(species);
            renderFilterTags();
            renderTable();
        };
        container.insertBefore(tag, input);
    });

    // Hide the placeholder once at least one Pokémon is selected.
    // Width and layout are handled by flexbox; the input fills whatever
    // space the tags leave and wraps to a new line when they don't fit.
    input.placeholder = activeFilters.size ? "" : "Search Pokémon...";
}

/*************************************************
 * EXISTING HELPERS
 *************************************************/

function formatSpeciesSlug(species) {
    let slug = species.toLowerCase().trim().replace(/[^a-z0-9-]/g, "");
    if (slug === "kommo-o") return "kommoo";
    if (slug === "porygon-z") return "porygonz";
    if (/^tauros-paldea-/i.test(slug)) slug = slug.replace(/^tauros-paldea-/, "tauros-paldea");
    if (slug === "tatsugiri-curly") return "tatsugiri";
    if (slug === "chien-pao") return "chienpao";
    if (slug === "chi-yu") return "chiyu";
    if (slug === "ting-lu") return "tinglu";
    if (slug === "wo-chien") return "wochien";
    if (slug === "urshifu-rapid-strike") return "urshifu-rapidstrike";
    if (slug === "ho-oh") return "hooh";
    if (slug === "necrozma-dawn-wings") return "necrozma-dawnwings";
    if (slug === "necrozma-dusk-mane") return "necrozma-duskmane";
    if (slug.endsWith("-m")) slug = slug.replace(/-m$/, "");
    return slug;
}

/*************************************************
 * TEAM FILTER (search dropdown)
 *************************************************/

function initTeamFilter() {
    const input = document.getElementById('teamFilterInput');
    const dropdown = document.getElementById('teamFilterDropdown');
    const container = document.getElementById('selectedPokemonContainer');

    let matches = [];     // current filtered species names
    let activeIndex = -1; // keyboard-highlighted item

    function computeMatches(filter) {
        const q = filter.toLowerCase();
        return allPokemonList
            .filter(p => p.toLowerCase().includes(q) && !activeFilters.has(formatSpeciesSlug(p)))
            // Prefix matches first, then alphabetical, so results feel predictable.
            .sort((a, b) => {
                const ap = a.toLowerCase().startsWith(q);
                const bp = b.toLowerCase().startsWith(q);
                if (ap !== bp) return ap ? -1 : 1;
                return a.localeCompare(b);
            })
            .slice(0, MAX_DROPDOWN_RESULTS);
    }

    function setActive(index) {
        const items = dropdown.querySelectorAll('.dropdown-item');
        if (!items.length) return;
        activeIndex = (index + items.length) % items.length;
        items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
        items[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    function closeDropdown() {
        dropdown.style.display = 'none';
        activeIndex = -1;
    }

    function chooseSpecies(species) {
        if (activeFilters.size < maxFilters) {
            activeFilters.add(species);
            renderFilterTags();
            renderTable();
        }
        input.value = '';
        closeDropdown();
    }

    function updateDropdown(filter = '') {
        if (!filter.trim()) { closeDropdown(); return; }

        matches = computeMatches(filter);
        activeIndex = -1;

        const fragment = document.createDocumentFragment();
        matches.forEach(p => {
            const slug = formatSpeciesSlug(p);
            const item = document.createElement('li');
            item.className = 'dropdown-item';
            item.innerHTML = `<img src="${SPRITE_BASE}${slug}.png" class="pokemon-icon" loading="lazy" decoding="async" width="32" height="32"> ${p}`;
            item.onmousedown = e => {
                e.preventDefault();
                chooseSpecies(slug);
            };
            fragment.appendChild(item);
        });
        dropdown.replaceChildren(fragment);

        dropdown.style.display = matches.length ? 'block' : 'none';
    }

    // Debounce input so we don't rebuild the list on every keystroke.
    let debounceTimer;
    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => updateDropdown(input.value), 100);
    });

    input.addEventListener('focus', () => updateDropdown(input.value));

    input.addEventListener('keydown', e => {
        const open = dropdown.style.display === 'block';
        switch (e.key) {
            case 'ArrowDown':
                if (open) { e.preventDefault(); setActive(activeIndex + 1); }
                else updateDropdown(input.value);
                break;
            case 'ArrowUp':
                if (open) { e.preventDefault(); setActive(activeIndex - 1); }
                break;
            case 'Enter':
                if (open && matches.length) {
                    e.preventDefault();
                    const pick = activeIndex >= 0 ? matches[activeIndex] : matches[0];
                    chooseSpecies(formatSpeciesSlug(pick));
                }
                break;
            case 'Escape':
                closeDropdown();
                break;
        }
    });

    document.addEventListener('click', e => {
        if (!container.contains(e.target) && !dropdown.contains(e.target)) closeDropdown();
    });
}

/*************************************************
 * EVENT DELEGATION (table interactions)
 *************************************************/

function initTableEvents() {
    const tableBody = document.getElementById("pokeTableBody");
    tableBody.addEventListener('click', e => {
        const icon = e.target.closest('.pokemon-icon');
        if (icon) {
            toggleFilter(icon.dataset.species);
            return;
        }
        const info = e.target.closest('.info-button');
        if (info && info.dataset.url) window.open(info.dataset.url, '_blank', 'noopener');
    });
}

/*************************************************
 * INIT
 *************************************************/

window.addEventListener("DOMContentLoaded", () => {
    initTableEvents();
    initInfiniteScroll();
    loadPastes();
});
