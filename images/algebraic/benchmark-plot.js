async function enhanceBenchmarkPlot(figure) {
    const image = figure.querySelector('img');
    if (!image || figure.dataset.benchmarkPlotReady) return;
    figure.dataset.benchmarkPlotReady = 'loading';
    try {
        const response = await fetch(image.src);
        if (!response.ok) throw new Error(`Benchmark plot: ${response.status}`);
        const parsed = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
        if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') {
            throw new Error('Invalid benchmark SVG');
        }
        const svg = document.importNode(parsed.documentElement, true);
        const points = [...svg.querySelectorAll('.benchmark-points circle[data-graph]')];
        if (!points.length) throw new Error('Missing benchmark points');
        const tooltip = document.createElement('div');
        tooltip.className = 'benchmark-tooltip';
        tooltip.hidden = true;
        const name = document.createElement('strong');
        const detail = document.createElement('span');
        tooltip.append(name, detail);
        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ring.setAttribute('class', 'benchmark-point-ring');
        ring.setAttribute('r', '9');
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', '#000');
        ring.setAttribute('stroke-width', '1.2');
        ring.setAttribute('visibility', 'hidden');
        svg.append(ring);
        let active = null;
        let pinned = false;
        let lastTap = null;

        const center = point => {
            const box = point.getBoundingClientRect();
            return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        };
        const place = () => {
            if (!active || tooltip.hidden) return;
            const box = figure.getBoundingClientRect();
            const point = center(active);
            const width = tooltip.offsetWidth;
            const height = tooltip.offsetHeight;
            const left = Math.max(0, Math.min(point.x - box.left - width / 2, box.width - width));
            const above = point.y - box.top - height - 12;
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${above >= 0 ? above : point.y - box.top + 14}px`;
        };
        const hide = () => {
            active = null;
            pinned = false;
            lastTap = null;
            tooltip.hidden = true;
            ring.setAttribute('visibility', 'hidden');
        };
        const show = (point, pin = pinned) => {
            active = point;
            pinned = pin;
            name.textContent = point.dataset.graph;
            detail.textContent = point.dataset.detail;
            tooltip.hidden = false;
            for (const candidate of points) candidate.setAttribute('tabindex', candidate === point ? '0' : '-1');
            ring.setAttribute('cx', point.getAttribute('cx'));
            ring.setAttribute('cy', point.getAttribute('cy'));
            ring.setAttribute('visibility', 'visible');
            place();
        };
        const nearby = event => points.map(point => {
            const p = center(point);
            return { point, distance: Math.hypot(event.clientX - p.x, event.clientY - p.y) };
        }).filter(p => p.distance <= (event.pointerType === 'touch' ? 24 : 14))
            .sort((a, b) => a.distance - b.distance);

        for (const [index, point] of points.entries()) {
            point.setAttribute('role', 'button');
            point.setAttribute('tabindex', index === 0 ? '0' : '-1');
            point.addEventListener('focus', () => show(point));
            point.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    hide();
                } else if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                    event.preventDefault();
                    pinned = false;
                    const step = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1
                        : (index + step + points.length) % points.length;
                    points[next].focus({ preventScroll: true });
                } else if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    show(point, true);
                }
            });
        }
        svg.addEventListener('pointermove', event => {
            if (pinned || event.pointerType === 'touch') return;
            const nearest = nearby(event)[0];
            if (nearest) show(nearest.point);
            else hide();
        });
        svg.addEventListener('pointerleave', () => {
            if (!pinned) hide();
        });
        svg.addEventListener('click', event => {
            if (event.detail === 0 && points.includes(event.target)) {
                return show(event.target, true);
            }
            const candidates = nearby(event);
            if (!candidates.length) return hide();
            const close = candidates.filter(p => p.distance <= candidates[0].distance + 6);
            const repeated = lastTap && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 10;
            const index = repeated ? (close.findIndex(p => p.point === active) + 1) % close.length : 0;
            show(close[index].point, true);
            lastTap = { x: event.clientX, y: event.clientY };
        });
        svg.addEventListener('focusout', event => {
            if (!svg.contains(event.relatedTarget)) hide();
        });
        document.addEventListener('pointerdown', event => {
            if (!figure.contains(event.target)) hide();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') hide();
        });
        window.addEventListener('resize', place);
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(place).observe(figure);
        (image.closest('a') ?? image).replaceWith(svg);
        figure.append(tooltip);
        figure.dataset.benchmarkPlotReady = 'true';
    } catch (error) {
        delete figure.dataset.benchmarkPlotReady;
        console.warn('Using static benchmark plot.', error);
    }
}

document.querySelectorAll('[data-benchmark-plot]').forEach(enhanceBenchmarkPlot);
