// Renders the Markdown file named in #doc[data-src] (sanitized, since docs come from many people).
(async function () {
  const main = document.getElementById('doc');
  const src = main.dataset.src;
  try {
    const res = await fetch(src, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status}`);
    const md = await res.text();
    main.innerHTML = DOMPurify.sanitize(marked.parse(md, { gfm: true }));
    main.querySelectorAll('a[href^="http"]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });

    const bar = document.createElement('nav');
    bar.className = 'docbar';
    bar.innerHTML = '<a href="../">← 목록</a><a class="raw">원본 .md</a><button type="button">Markdown 복사</button>';
    bar.querySelector('.raw').href = src;
    const btn = bar.querySelector('button');
    btn.onclick = async () => {
      try { await navigator.clipboard.writeText(md); btn.textContent = '복사됨'; }
      catch { btn.textContent = '복사 실패'; }
      setTimeout(() => { btn.textContent = 'Markdown 복사'; }, 1500);
    };
    document.body.prepend(bar);
  } catch (e) {
    main.innerHTML = '<p class="loading">문서를 불러오지 못했습니다. 방금 올렸다면 1분쯤 뒤에 새로고침하세요.</p>';
  }
})();
