// Catálogos grandes: mantém TODOS os itens disponíveis, mas cria os cards em
// blocos conforme o usuário rola. Assim RexTV/PlayNow não são truncados e PCs
// antigos não precisam desenhar milhares de capas de uma vez.
(() => {
    const page = location.pathname.split('/').pop().toLowerCase();
    const supported = new Set(['canais.html', 'filmes.html', 'series.html']);
    if (!supported.has(page)) return;

    document.addEventListener('DOMContentLoaded', () => {
        const grid = document.getElementById('grid');
        const scroller = document.querySelector('.content-area');
        if (!grid || !scroller) return;

        const batchSize = page === 'canais.html' ? 240 : page === 'filmes.html' ? 180 : 160;
        let current = [];
        let shown = 0;
        let generation = 0;

        let progress = document.getElementById('catalogProgress');
        if (!progress) {
            progress = document.createElement('div');
            progress.id = 'catalogProgress';
            progress.style.cssText = 'padding:16px 4px 6px;text-align:center;color:#94a3b8;font-size:12px;';
            scroller.appendChild(progress);
        }

        function updateSidebarTotal() {
            const totalEl = document.querySelector('#cats .cat-head:first-child .num');
            if (!totalEl) return;

            if (page === 'filmes.html' && typeof filmes !== 'undefined' && String(catAtiva) === '0') {
                totalEl.textContent = Number(filmes.length || 0).toLocaleString('pt-BR');
            } else if (page === 'series.html' && typeof series !== 'undefined' && String(catAtiva) === '0') {
                totalEl.textContent = Number(series.length || 0).toLocaleString('pt-BR');
            }
        }

        function makeImage(src, className) {
            if (!src) return null;
            const img = document.createElement('img');
            if (className) img.className = className;
            img.src = src;
            img.loading = 'lazy';
            img.referrerPolicy = 'no-referrer';
            img.alt = '';
            img.onerror = () => img.remove();
            return img;
        }

        function appendChannel(ch) {
            const card = document.createElement('div');
            card.className = 'canal';

            const star = document.createElement('span');
            star.className = 'fav-star';
            star.textContent = '★';
            star.addEventListener('click', (event) => {
                event.stopPropagation();
                window.toggleFavorito?.(String(ch.stream_id));
            });
            card.appendChild(star);

            const image = makeImage(ch.stream_icon, 'art');
            if (image) card.appendChild(image);
            else {
                const fallback = document.createElement('div');
                fallback.className = 'art';
                fallback.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:3rem;';
                fallback.textContent = '📺';
                card.appendChild(fallback);
            }

            const grad = document.createElement('div');
            grad.className = 'grad';
            const name = document.createElement('div');
            name.className = 'nome';
            name.textContent = ch.name || 'Canal';
            const info = document.createElement('div');
            info.className = 'info';
            const dot = document.createElement('span');
            dot.className = 'live-dot';
            info.append(dot, document.createTextNode('AO VIVO'));
            grad.append(name, info);
            card.appendChild(grad);
            card.addEventListener('click', () => window.abrirCanal?.(ch));
            grid.appendChild(card);
        }

        function appendMovie(f) {
            const card = document.createElement('div');
            card.className = 'filme';
            const image = makeImage(f.stream_icon);
            if (image) card.appendChild(image);
            const grad = document.createElement('div');
            grad.className = 'grad';
            const name = document.createElement('div');
            name.className = 'nome';
            name.textContent = f.name || 'Filme';
            const year = document.createElement('div');
            year.className = 'ano';
            year.textContent = f.year || 'Filme';
            grad.append(name, year);
            card.appendChild(grad);
            card.addEventListener('click', () => {
                localStorage.setItem('chosen_stream_id', f.stream_id);
                location.href = 'ver_filme.html?auto=1';
            });
            grid.appendChild(card);
        }

        function appendSeries(s) {
            const card = document.createElement('div');
            card.className = 'serie';
            const image = makeImage(s.cover);
            if (image) card.appendChild(image);
            const grad = document.createElement('div');
            grad.className = 'grad';
            const name = document.createElement('div');
            name.className = 'nome';
            name.textContent = s.name || 'Série';
            const year = document.createElement('div');
            year.className = 'info';
            year.textContent = s.year || 'Série';
            grad.append(name, year);
            card.appendChild(grad);
            card.addEventListener('click', () => {
                localStorage.setItem('chosen_serie_id', s.series_id);
                location.href = 'ver_serie.html?auto=1';
            });
            grid.appendChild(card);
        }

        const appendItem = page === 'canais.html' ? appendChannel : page === 'filmes.html' ? appendMovie : appendSeries;

        function updateProgress() {
            if (!current.length) {
                progress.textContent = '';
                return;
            }
            progress.textContent = shown < current.length
                ? `Mostrando ${shown.toLocaleString('pt-BR')} de ${current.length.toLocaleString('pt-BR')} · role para carregar mais`
                : `${current.length.toLocaleString('pt-BR')} itens carregados`;
        }

        function appendNext(expectedGeneration = generation) {
            if (expectedGeneration !== generation || shown >= current.length) return;
            const end = Math.min(shown + batchSize, current.length);
            const fragment = document.createDocumentFragment();
            const holder = document.createElement('div');
            holder.style.display = 'contents';
            fragment.appendChild(holder);

            // appendItem escreve no grid; durante o lote redirecionamos appendChild
            // para um fragmento para reduzir repaints em máquinas mais antigas.
            const originalAppend = grid.appendChild.bind(grid);
            grid.appendChild = (node) => holder.appendChild(node);
            try {
                for (let i = shown; i < end; i++) appendItem(current[i]);
            } finally {
                grid.appendChild = originalAppend;
            }
            grid.appendChild(fragment);
            shown = end;
            updateProgress();

            requestAnimationFrame(() => {
                if (expectedGeneration !== generation || shown >= current.length) return;
                if (scroller.scrollHeight <= scroller.clientHeight + 180) appendNext(expectedGeneration);
            });
        }

        window.renderizar = function renderizarCompleto(lista) {
            generation++;
            const localGeneration = generation;
            current = Array.isArray(lista) ? lista : [];
            shown = 0;
            grid.replaceChildren();
            scroller.scrollTop = 0;
            updateSidebarTotal();

            if (!current.length) {
                const empty = document.createElement('p');
                empty.style.color = '#94a3b8';
                empty.textContent = page === 'canais.html' ? 'Nenhum canal encontrado.' : page === 'filmes.html' ? 'Nenhum filme encontrado.' : 'Nenhuma série encontrada.';
                grid.appendChild(empty);
                updateProgress();
                return;
            }
            appendNext(localGeneration);
        };

        // Retira também o corte da busca dos canais (antes limitava a 300).
        if (page === 'canais.html') {
            window.buscar = function buscarCatalogoCompleto() {
                const q = document.getElementById('search').value.toLowerCase();
                window.renderizar(todosCanais.filter(ch => String(ch.name || '').toLowerCase().includes(q)));
            };
        } else if (page === 'filmes.html') {
            window.buscar = function buscarCatalogoCompleto() {
                const q = document.getElementById('search').value.toLowerCase();
                window.renderizar(filmes.filter(f => String(f.name || '').toLowerCase().includes(q)));
            };
        } else {
            window.buscar = function buscarCatalogoCompleto() {
                const q = document.getElementById('search').value.toLowerCase();
                window.renderizar(series.filter(s => String(s.name || '').toLowerCase().includes(q)));
            };
        }

        scroller.addEventListener('scroll', () => {
            if (shown >= current.length) return;
            if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 700) appendNext(generation);
        }, { passive: true });

        // Se o catálogo respondeu muito rápido e a função antiga chegou a renderizar
        // antes do DOMContentLoaded, refaz a busca vazia usando a versão sem corte.
        setTimeout(() => {
            if (!document.getElementById('search')?.value) window.buscar?.();
        }, 0);
    }, { once: true });
})();
