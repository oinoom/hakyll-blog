const diagrams = new Map();

function loadDiagram(url) {
    if (!diagrams.has(url)) {
        diagrams.set(url, fetch(url).then(response => {
            if (!response.ok) throw new Error(`Neighbor diagram: ${response.status}`);
            return response.text();
        }));
    }
    return diagrams.get(url);
}

async function enhanceNeighbors(figure) {
    const image = figure.querySelector('img');
    if (!image || figure.dataset.neighborsReady) return;
    const source = await loadDiagram(new URL(figure.dataset.neighborDiagram, document.baseURI).href);
    const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (parsed.querySelector('parsererror')) throw new Error('Invalid neighbor SVG');
    const svg = document.importNode(parsed.documentElement, true);
    const stateKey = figure.dataset.neighbors === 'Down' ? 'downState' : 'upState';
    const initial = figure.dataset.neighborInitial;
    const prefix = `${figure.id}-`;

    for (const element of svg.querySelectorAll('[id]')) element.id = prefix + element.id;
    for (const element of svg.querySelectorAll('*')) {
        for (const attribute of [...element.attributes]) {
            if (attribute.value.includes('url(#')) {
                element.setAttribute(attribute.name, attribute.value.replaceAll('url(#', `url(#${prefix}`));
            }
        }
    }

    const scenes = new Map([...svg.querySelectorAll('[data-neighbor-scene]')]
        .map(scene => [scene.dataset.neighborScene, scene]));
    const controls = [...svg.querySelectorAll('[data-neighbor-node]')];
    if (!scenes.has(initial) || !controls.length) throw new Error('Missing neighbor scenes');
    const caption = document.createElement('figcaption');
    caption.className = 'neighbor-instructions';
    caption.textContent = 'hover or tap a node';

    const select = state => {
        const active = scenes.get(state);
        if (!active || figure.dataset.neighborState === state) return;
        for (const [key, scene] of scenes) scene.setAttribute('display', key === state ? 'inline' : 'none');
        for (const control of controls) control.setAttribute('aria-pressed', String(control.dataset[stateKey] === state));
        figure.dataset.neighborState = state;
        figure.dataset.neighborTargets = active.dataset.neighborTargets;
    };

    for (const control of controls) {
        const state = control.dataset[stateKey];
        const activate = () => select(state);
        control.addEventListener('pointerenter', event => {
            if (event.pointerType === 'mouse' || event.pointerType === 'pen') activate();
        });
        control.addEventListener('click', activate);
        control.addEventListener('focus', activate);
        control.addEventListener('keydown', event => {
            if (!['Enter', ' ', 'Escape'].includes(event.key)) return;
            event.preventDefault();
            select(event.key === 'Escape' ? initial : state);
        });
    }

    select(initial);
    const fallback = image.closest('a') ?? image;
    fallback.replaceWith(svg);
    figure.append(caption);
    figure.dataset.neighborsReady = 'true';
}

document.querySelectorAll('[data-neighbors]').forEach(figure => {
    enhanceNeighbors(figure).catch(error => {
        console.warn('Using static neighbor diagram.', error);
    });
});
