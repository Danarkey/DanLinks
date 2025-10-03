let activeFilters = new Set();
let allPokemonList = [];
const maxFilters = 6;

async function loadPastes() {
    const tableBody = document.getElementById('pokeTableBody');
    tableBody.innerHTML = '';

    try {
        const res = await fetch('pastes.json');
        const pastes = await res.json();

        // Build alphabetical Pokémon list for filter
        const uniquePokemon = new Set();
        pastes.forEach(paste => paste.pokemon.forEach(p => uniquePokemon.add(p.species)));
        allPokemonList = [...uniquePokemon].sort((a, b) => a.localeCompare(b));

        // Populate table rows
        pastes.forEach(paste => {
            const { author, description, pokemon, url, hasEVs } = paste;

            const teamHTML = pokemon.map(p => {
                const slug = formatSpeciesSlug(p.species);
                return `<img src="https://play.pokemonshowdown.com/sprites/gen5/${slug}.png" 
                         alt="${p.species}" title="${p.species}" 
                         class="pokemon-icon" data-species="${slug}">`;
            }).join(' ');

            const evHTML = hasEVs ? `<span class="text-success">&#10003;</span>` : `<span class="text-error">&#10007;</span>`;
            const detailsHTML = `<span class="info-button btn-outline btn-ghost btn-xs btn" onclick="window.open('${url}','_blank')">&#9432;</span>`;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="author-col">${author}</td>
                <td class="desc-col">${description}</td>
                <td class="team-cell">${teamHTML}</td>
                <td class="ev-cell">${evHTML}</td>
                <td class="paste-col">${detailsHTML}</td>
            `;
            tableBody.appendChild(row);
        });

        initTeamFilter();
        addSpriteClickListeners();
    } catch (err) {
        console.error('Error loading pastes.json', err);
    }
}

function formatSpeciesSlug(species) {
    let slug = species.toLowerCase().trim();
    slug = slug.replace(/[^a-z0-9-]/g, '');

    // Kommo-o: correct spelling has hyphen, but sprite repo uses kommoo.png
    if (slug === 'kommo-o') {
        return 'kommoo';
    }

    // Porygon-Z: correct spelling has hyphen, but sprite repo uses porygonz.png
    if (slug === 'porygon-z') {
        return 'porygonz';
    }

    // Tauros-Paldea forms: remove second hyphen for image URL
    if (/^tauros-paldea-/i.test(slug)) {
        slug = slug.replace(/^tauros-paldea-/, 'tauros-paldea');
    }

    // Tatsugiri-Curly → use base tatsugiri.png
    if (slug === 'tatsugiri-curly') {
        return 'tatsugiri';
    }

    // Existing rule: remove -m suffix from some Pokémon
    if (slug.endsWith('-m')) {
        slug = slug.replace(/-m$/, '');
    }

    return slug;
}

function initTeamFilter() {
    const input = document.getElementById('teamFilterInput');
    const dropdown = document.getElementById('teamFilterDropdown');
    const container = document.getElementById('selectedPokemonContainer');

    function updateInputWidth() {
        const iconWidth = 40 + 4; // 40px icon + 4px gap
        const usedWidth = activeFilters.size * iconWidth + 10; // + padding
        input.style.width = `calc(100% - ${usedWidth}px)`;
    }

    function renderTags() {
        container.querySelectorAll('.pokemon-tag').forEach(tag => tag.remove());
        activeFilters.forEach(species => {
            const tag = document.createElement('div');
            tag.className = 'pokemon-tag';
            tag.innerHTML = `<img src="https://play.pokemonshowdown.com/sprites/gen5/${species}.png"><span class="remove-tag">&#10005;</span>`;
            tag.querySelector('.remove-tag').addEventListener('click', () => {
                activeFilters.delete(species);
                renderTags();
                applyFilters();
                updateTableHighlight();
                updateInputWidth();
            });
            container.insertBefore(tag, input);
        });
        updateInputWidth();
    }

    function updateDropdown(filter = '') {
        dropdown.innerHTML = '';
        if (!filter) {
            dropdown.style.display = 'none';
            return;
        }

        const filtered = allPokemonList
            .filter(p => p.toLowerCase().includes(filter.toLowerCase()) && !activeFilters.has(formatSpeciesSlug(p)))
            .sort((a, b) => a.localeCompare(b));

        filtered.forEach(p => {
            const slug = formatSpeciesSlug(p);
            const item = document.createElement('li');
            item.className = 'dropdown-item';
            item.innerHTML = `<img src="https://play.pokemonshowdown.com/sprites/gen5/${slug}.png" class="pokemon-icon"> ${p}`;
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                if (activeFilters.size < maxFilters) {
                    activeFilters.add(slug);
                    renderTags();
                    applyFilters();
                    updateTableHighlight();
                }
                input.value = '';
                dropdown.style.display = 'none';
            });
            dropdown.appendChild(item);
        });

        dropdown.style.display = filtered.length > 0 ? 'block' : 'none';
        // Position dropdown below container
        const rect = container.getBoundingClientRect();
        dropdown.style.top = `${container.offsetHeight}px`;
        dropdown.style.left = `0px`;
    }

    input.addEventListener('input', () => updateDropdown(input.value));
    input.addEventListener('focus', () => updateDropdown(input.value));

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
}

function applyFilters() {
    const rows = document.querySelectorAll('#pokeTableBody tr');
    rows.forEach(row => {
        const rowSpecies = Array.from(row.querySelectorAll('.pokemon-icon')).map(i => i.dataset.species);
        row.style.display = [...activeFilters].every(f => rowSpecies.includes(f)) || activeFilters.size === 0 ? '' : 'none';
    });
}

function updateTableHighlight() {
    const icons = document.querySelectorAll('#pokeTableBody .pokemon-icon');
    icons.forEach(icon => {
        icon.classList.toggle('filter-active', activeFilters.has(icon.dataset.species));
    });
}

function addSpriteClickListeners() {
    const icons = document.querySelectorAll('#pokeTableBody .pokemon-icon');
    icons.forEach(icon => {
        icon.addEventListener('click', () => {
            const species = icon.dataset.species;
            if (activeFilters.has(species)) {
                activeFilters.delete(species);
            } else if (activeFilters.size < maxFilters) {
                activeFilters.add(species);
            }
            renderFilterTags();
            applyFilters();
            updateTableHighlight();
        });
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
        tag.querySelector('.remove-tag').addEventListener('click', () => {
            activeFilters.delete(species);
            renderFilterTags();
            applyFilters();
            updateTableHighlight();
        });
        container.insertBefore(tag, input);
    });
    // Shrink input width dynamically
    const iconWidth = 40 + 4; // icon + gap
    const usedWidth = activeFilters.size * iconWidth + 10;
    input.style.width = `calc(100% - ${usedWidth}px)`;
}

window.addEventListener('DOMContentLoaded', loadPastes);
