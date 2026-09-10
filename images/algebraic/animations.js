const wideFigures = window.matchMedia('(min-width: 1024px)');
document.querySelectorAll('.figure-flow > figure:is(.figure--left, .figure--right)').forEach(figure => {
    const group = figure.parentElement;
    const anchor = figure.nextSibling;
    const update = () => {
        const before = wideFigures.matches ? group.firstChild : anchor;
        if (before === figure || figure.nextSibling === before) return;
        if (group.moveBefore) {
            group.moveBefore(figure, before);
        } else {
            const focused = figure.contains(document.activeElement) ? document.activeElement : null;
            group.insertBefore(figure, before);
            focused?.focus({ preventScroll: true });
        }
    };
    wideFigures.addEventListener('change', update);
    update();
});

document.querySelectorAll('[data-animation]').forEach(figure => {
    const image = figure.querySelector('[data-animation-src]');
    if (!image) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
        const source = motion.matches ? image.dataset.animationPoster : image.dataset.animationSrc;
        const url = new URL(source, document.baseURI).href;
        if (image.src !== url) image.src = url;
    };
    motion.addEventListener('change', update);
    update();
});
