/*************************************************
 * MANUAL CONFIG
 *************************************************/

const DEFAULT_FORMAT = "regf"; // e.g. "regf", "regh"

const FORMAT_CONFIG = {
    regf: { label: "VGC 2024 Regulation F", file: "pastesF.json" },
    regh: { label: "VGC 2025 Regulation H", file: "pastesH.json" }
};

/*************************************************
 * GLOBAL STATE
 *************************************************/

let allPastes = [];
let selectedFormat = "all";
let activeFilters = new Set();
let allPokemonList = [];
const maxFilters = 6;

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
 * DATA LOADING
 *************************************************/

async function loadPastes() {
    const tableBody = document.getElementById("pokeTableBody");
    tableBody.innerHTML = "";

    selectedFormat = getFormatFromURL();

    try {
        const fetches = Object.entries(FORMAT_CONFIG).map(async ([key, cfg]) => {
            const res = await fetch(cfg.file);
            const data = await res.json();
            return data.map(entry => ({ ...entry, _formatKey: key }));
        });

        allPastes = (await Promise.all(fetches)).flat();

        populateFormatDropdown();
        buildPokemonList(allPastes);
        renderTable();
        initTeamFilter();
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

    select.addEventListener("change", e => {
        selectedFormat = e.target.value;
        updateURL();
        renderTable();
    });
}

/*************************************************
 * TABLE RENDERING
 *************************************************/

function renderTable() {
    const tableBody = document.getElementById("pokeTableBody");
    tableBody.innerHTML = "";

    const filtered = allPastes.filter(paste => {
        const matchesFormat = selectedFormat === "all" || paste._formatKey === selectedFormat;
        const rowSpecies = paste.pokemon.map(p => formatSpeciesSlug(p.species));
        const matchesPokemon = activeFilters.size === 0 || [...activeFilters].every(f => rowSpecies.includes(f));
        return matchesFormat && matchesPokemon;
    });

    filtered.forEach(paste => {
        const { author, description, pokemon, url, hasEVs } = paste;
        const teamHTML = pokemon.map(p => {
            const slug = formatSpeciesSlug(p.species);
            return `<img src="https://play.pokemonshowdown.com/sprites/gen5/${slug}.png" alt="${p.species}" title="${p.species}" class="pokemon-icon" data-species="${slug}">`;
        }).join("");

        const evHTML = hasEVs ? `<span class="text-success">&#10003;</span>` : `<span class="text-error">&#10007;</span>`;
        const detailsHTML = `<span class="info-button btn-outline btn-ghost btn-xs btn" onclick="window.open('${url}','_blank')">&#9432;</span>`;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td class="author-col">${author}</td>
            <td class="desc-col">${description}</td>
            <td class="team-cell">${teamHTML}</td>
            <td class="ev-cell">${evHTML}</td>
            <td class="paste-col">${detailsHTML}</td>
        `;

        tableBody.appendChild(row);
    });

    updateTableHighlight();
    addSpriteClickListeners();
}

/*************************************************
 * POKÉMON FILTER SUPPORT
 *************************************************/

function buildPokemonList(pastes) {
    const uniquePokemon = new Set();
    pastes.forEach(p => p.pokemon.forEach(mon => uniquePokemon.add(mon.species)));
    allPokemonList = [...uniquePokemon].sort();
}

function applyFilters() {
    const rows = document.querySelectorAll('#pokeTableBody tr');
    rows.forEach(row => {
        const rowSpecies = Array.from(row.querySelectorAll('.pokemon-icon')).map(i => i.dataset.species);
        row.style.display = [...activeFilters].every(f => rowSpecies.includes(f)) || activeFilters.size === 0 ? '' : 'none';
    });
}

function updateTableHighlight() {
    document.querySelectorAll('#pokeTableBody .pokemon-icon').forEach(icon => {
        icon.classList.toggle('filter-active', activeFilters.has(icon.dataset.species));
    });
}

function addSpriteClickListeners() {
    const icons = document.querySelectorAll('#pokeTableBody .pokemon-icon');
    icons.forEach(icon => {
        icon.onclick = () => {
            const species = icon.dataset.species;
            if (activeFilters.has(species)) activeFilters.delete(species);
            else if (activeFilters.size < maxFilters) activeFilters.add(species);
            renderFilterTags();
            applyFilters();
            updateTableHighlight();
        };
    });
}

function renderFilterTags() {
    const container = document.getElementById('selectedPokemonContainer');
    const input = document.getElementById('teamFilterInput');
    container.querySelectorAll('.pokemon-tag').forEach(tag => tag.remove());

    activeFilters.forEach(species => {
        const tag = document.createElement('div');
        tag.className = 'pokemon-tag';
        tag.innerHTML = `<img src="https://play.pokemonshowdown.com/sprites/gen5/${species}.png"><span class="remove-tag">&#10005;</span>`;
        tag.querySelector('.remove-tag').onclick = () => {
            activeFilters.delete(species);
            renderFilterTags();
            applyFilters();
            updateTableHighlight();
        };
        container.insertBefore(tag, input);
    });

    // Shrink input width dynamically
    const iconWidth = 40 + 4;
    const usedWidth = activeFilters.size * iconWidth + 10;
    input.style.width = `calc(100% - ${usedWidth}px)`;
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
    if (slug.endsWith("-m")) slug = slug.replace(/-m$/, "");
    return slug;
}

function initTeamFilter() {
    const input = document.getElementById('teamFilterInput');
    const dropdown = document.getElementById('teamFilterDropdown');
    const container = document.getElementById('selectedPokemonContainer');

    function updateDropdown(filter = '') {
        dropdown.innerHTML = '';
        if (!filter) { dropdown.style.display = 'none'; return; }

        const filtered = allPokemonList
            .filter(p => p.toLowerCase().includes(filter.toLowerCase()) && !activeFilters.has(formatSpeciesSlug(p)))
            .sort((a, b) => a.localeCompare(b));

        filtered.forEach(p => {
            const slug = formatSpeciesSlug(p);
            const item = document.createElement('li');
            item.className = 'dropdown-item';
            item.innerHTML = `<img src="https://play.pokemonshowdown.com/sprites/gen5/${slug}.png" class="pokemon-icon"> ${p}`;
            item.onmousedown = e => {
                e.preventDefault();
                if (activeFilters.size < maxFilters) {
                    activeFilters.add(slug);
                    renderFilterTags();
                    applyFilters();
                    updateTableHighlight();
                }
                input.value = '';
                dropdown.style.display = 'none';
            };
            dropdown.appendChild(item);
        });

        dropdown.style.display = filtered.length ? 'block' : 'none';
        dropdown.style.top = `${container.offsetHeight}px`;
        dropdown.style.left = `0px`;
    }

    input.addEventListener('input', () => updateDropdown(input.value));
    input.addEventListener('focus', () => updateDropdown(input.value));
    document.addEventListener('click', e => {
        if (!container.contains(e.target) && !dropdown.contains(e.target)) dropdown.style.display = 'none';
    });
}

/*************************************************
 * INIT
 *************************************************/

window.addEventListener("DOMContentLoaded", loadPastes);
