async function enhanceSearchPlayer(figure) {
    const fallback = figure.querySelector('a');
    if (!fallback) return;
    try {
        const response = await fetch(new URL(figure.dataset.searchSrc, document.baseURI));
        if (!response.ok) return;
        const animation = await response.json();
        if (!Array.isArray(animation.frames) || !animation.frames.length) return;
        const parser = new DOMParser();
        const kinds = ['Up', 'Down', 'At'];
        const frames = animation.frames.map(frame => {
            const parsed = parser.parseFromString(frame.svg, 'image/svg+xml');
            const svg = parsed.documentElement;
            if (parsed.querySelector('parsererror, script, foreignObject') || svg.localName !== 'svg') throw new Error('Invalid search frame');
            if (!Number.isFinite(frame.delay) || frame.delay <= 0 || !Array.isArray(frame.queue)) throw new Error('Invalid search step');
            for (const entry of frame.queue) {
                if (!kinds.includes(entry.kind) || !Number.isFinite(entry.distance) || typeof entry.value !== 'string') throw new Error('Invalid queue entry');
            }
            return { ...frame, svg };
        });
        for (const kind of kinds) {
            const color = animation.palette?.[kind];
            if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Invalid search palette');
            figure.style.setProperty(`--search-${kind.toLowerCase()}`, color);
        }
        const controls = document.createElement('div');
        controls.className = 'search-playback';
        const button = (action, symbol) => {
            const element = document.createElement('button');
            element.type = 'button';
            element.dataset.searchAction = action;
            element.textContent = symbol;
            controls.append(element);
            return element;
        };
        const previous = button('previous', '←');
        const toggle = button('toggle', 'Ⅱ');
        const next = button('next', '→');
        const queue = document.createElement('div');
        queue.className = 'search-queue';
        const entries = document.createElement('ol');
        queue.append(entries);
        const fitQueue = () => {
            entries.style.removeProperty('--queue-scale');
            const available = queue.getBoundingClientRect().width;
            const items = [...entries.children];
            if (!available || !items.length) return;
            const gap = parseFloat(getComputedStyle(entries).columnGap);
            const needed = items.reduce((width, item) => width + item.getBoundingClientRect().width, gap * (items.length - 1));
            if (needed <= available) return;
            const borders = items.reduce((width, item) => {
                const style = getComputedStyle(item);
                return width + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
            }, 0);
            entries.style.setProperty('--queue-scale', (available - borders) / (needed - borders));
        };
        let index = 0;
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let playing = !motion.matches;
        let inView = true;
        let timer;
        const render = step => {
            const frame = frames[step];
            if (step !== index) frames[index].svg.replaceWith(frame.svg);
            index = step;
            entries.replaceChildren(...frame.queue.map((entry, position) => {
                const item = document.createElement('li');
                item.dataset.state = entry.kind;
                item.textContent = `(${entry.distance}, ${entry.kind} ${entry.value})`;
                if (position === 0) {
                    const label = document.createElement('small');
                    label.className = 'search-queue-next';
                    label.textContent = 'next';
                    item.append(label);
                }
                return item;
            }));
            fitQueue();
            const focused = document.activeElement;
            previous.disabled = index === 0;
            next.disabled = index === frames.length - 1;
            if ((focused === previous && previous.disabled) || (focused === next && next.disabled)) figure.focus({ preventScroll: true });
            figure.dataset.searchStep = String(index);
        };
        const schedule = () => {
            window.clearTimeout(timer);
            if (playing && inView && !document.hidden) {
                timer = window.setTimeout(() => {
                    render((index + 1) % frames.length);
                    schedule();
                }, frames[index].delay);
            }
        };
        const setPlaying = value => {
            playing = value;
            figure.dataset.searchPlaying = String(playing);
            toggle.textContent = playing ? 'Ⅱ' : '▶\uFE0E';
            schedule();
        };
        const step = direction => {
            setPlaying(false);
            render(Math.max(0, Math.min(frames.length - 1, index + direction)));
        };
        previous.addEventListener('click', () => step(-1));
        next.addEventListener('click', () => step(1));
        toggle.addEventListener('click', () => setPlaying(!playing));
        figure.addEventListener('keydown', event => {
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                step(event.key === 'ArrowLeft' ? -1 : 1);
            } else if (event.target === figure && (event.key === ' ' || event.key === 'Enter')) {
                event.preventDefault();
                setPlaying(!playing);
            }
        });
        motion.addEventListener('change', () => { if (motion.matches) setPlaying(false); });
        document.addEventListener('visibilitychange', schedule);
        if ('IntersectionObserver' in window) {
            inView = false;
            const observer = new IntersectionObserver(([entry]) => {
                inView = entry.isIntersecting;
                schedule();
            });
            observer.observe(figure);
        }
        fallback.replaceWith(frames[index].svg);
        figure.append(controls, queue);
        if ('ResizeObserver' in window) new ResizeObserver(fitQueue).observe(queue);
        else window.addEventListener('resize', fitQueue);
        figure.tabIndex = 0;
        render(0);
        setPlaying(playing);
        figure.dataset.searchReady = 'true';
    } catch {
        return;
    }
}

document.querySelectorAll('[data-search-player]').forEach(enhanceSearchPlayer);
