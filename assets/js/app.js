/* =========================================================
   app.js — 메인 애플리케이션
   - 해시(#/...) 기반 라우팅 (GitHub Pages 새로고침/딥링크 호환)
   - 화면: 내 서재 / 책 검색 / 책 상세
   ========================================================= */

const App = (() => {

  /* ===================== 공통 유틸 ===================== */

  function $(sel, root = document) { return root.querySelector(sel); }
  function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  }
  function fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const p = n => String(n).padStart(2, '0');
    return `${fmtDate(iso)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  const STATUS = {
    want:    { label: '읽고 싶은', cls: 'st-want' },
    reading: { label: '읽는 중',   cls: 'st-reading' },
    done:    { label: '완독',      cls: 'st-done' },
  };
  function statusBadge(status) {
    const s = STATUS[status] || STATUS.want;
    return `<span class="badge ${s.cls}">${s.label}</span>`;
  }

  // 별점 표시(읽기 전용). rating: 0~5, 0.5 단위
  function starsHtml(rating, lg = false) {
    let html = `<span class="stars ${lg ? 'lg' : ''}">`;
    for (let i = 1; i <= 5; i++) {
      if (rating >= i)            html += `<span class="s full">★</span>`;
      else if (rating >= i - 0.5) html += `<span class="s half">★</span>`;
      else                        html += `<span class="s">★</span>`;
    }
    html += `</span>`;
    if (rating > 0) html += `<span class="rating-num">${rating.toFixed(1)}</span>`;
    return html;
  }

  function coverHtml(book, extraClass = '') {
    if (book.thumbnail) {
      return `<img src="${escapeHtml(book.thumbnail)}" alt="${escapeHtml(book.title)} 표지"
                   loading="lazy" onerror="this.parentNode.innerHTML='<div class=&quot;no-cover&quot;>${escapeHtml(book.title)}</div>'" />`;
    }
    return `<div class="no-cover">${escapeHtml(book.title)}</div>`;
  }

  function authorsText(book) {
    return (book.authors && book.authors.length) ? book.authors.join(', ') : '저자 미상';
  }

  /* ===================== 토스트 / 모달 ===================== */

  function toast(msg, type = '') {
    const stack = $('#toastStack');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2200);
    setTimeout(() => el.remove(), 2600);
  }

  function openModal(html) {
    $('#modal').innerHTML = html;
    $('#modalBackdrop').hidden = false;
  }
  function closeModal() {
    $('#modalBackdrop').hidden = true;
    $('#modal').innerHTML = '';
  }
  // 배경 클릭 시 닫기
  document.addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeModal();
  });

  function confirmModal({ title, message, confirmText = '삭제', danger = true }) {
    return new Promise((resolve) => {
      openModal(`
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="mCancel">취소</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="mOk">${escapeHtml(confirmText)}</button>
        </div>`);
      $('#mCancel').onclick = () => { closeModal(); resolve(false); };
      $('#mOk').onclick = () => { closeModal(); resolve(true); };
    });
  }

  /* ===================== 라우터 ===================== */

  function navigate(hash) { window.location.hash = hash; }

  function router() {
    const user = Store.currentUser();
    const hash = window.location.hash || '#/library';

    // 로그인 안 된 상태 → 인증 화면
    if (!user) {
      $('#siteHeader').hidden = true;
      $('#view').innerHTML = Auth.render('login');
      Auth.bind('login', () => navigate('#/library') || router());
      return;
    }

    // 헤더 표시 + 사용자 이름
    $('#siteHeader').hidden = false;
    $('#userName').innerHTML = `<b>${escapeHtml(user.nickname)}</b>님`;

    const [, path, param] = hash.split('/'); // 예: '#/book/id_xxx' → ['#', 'book', 'id_xxx']

    // 내비 활성화 표시
    $all('#mainNav a').forEach(a => {
      a.classList.toggle('active', a.dataset.nav === (path || 'library'));
    });

    if (path === 'search')      renderSearch();
    else if (path === 'book')   renderDetail(param);
    else                        renderLibrary();

    window.scrollTo(0, 0);
  }

  /* ===================== 화면: 내 서재 ===================== */

  // 화면 상태(검색/정렬/필터)는 메모리에 보관
  let libState = { q: '', sort: 'recent', status: 'all', minRating: 0 };

  function computeStats(books) {
    const rated = books.filter(b => b.rating > 0);
    const avg = rated.length ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length) : 0;
    const thisYear = new Date().getFullYear();
    const doneThisYear = books.filter(b =>
      b.status === 'done' && b.finishDate && new Date(b.finishDate).getFullYear() === thisYear).length;
    return {
      total: books.length,
      want: books.filter(b => b.status === 'want').length,
      reading: books.filter(b => b.status === 'reading').length,
      done: books.filter(b => b.status === 'done').length,
      avg, doneThisYear,
    };
  }

  function applyFilters(books) {
    const norm = s => (s || '').toLowerCase();
    let list = books.slice();

    if (libState.status !== 'all') list = list.filter(b => b.status === libState.status);
    if (libState.minRating > 0)    list = list.filter(b => b.rating >= libState.minRating);
    if (libState.q.trim()) {
      const q = norm(libState.q);
      list = list.filter(b =>
        norm(b.title).includes(q) || norm(authorsText(b)).includes(q));
    }

    if (libState.sort === 'recent')      list.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
    else if (libState.sort === 'rating') list.sort((a, b) => b.rating - a.rating);
    else if (libState.sort === 'title')  list.sort((a, b) => a.title.localeCompare(b.title, 'ko'));

    return list;
  }

  function renderLibrary() {
    const books = Store.getLibrary();
    const st = computeStats(books);

    const headHtml = `
      <div class="page-head">
        <div class="eyebrow">My Library</div>
        <h1>내 서재</h1>
        <p>지금까지 ${st.total}권을 기록했어요.</p>
      </div>

      <div class="stats">
        <div class="stat"><div class="num">${st.total}</div><div class="lbl">전체</div></div>
        <div class="stat s-want"><div class="num">${st.want}</div><div class="lbl">읽고 싶은</div></div>
        <div class="stat s-reading"><div class="num">${st.reading}</div><div class="lbl">읽는 중</div></div>
        <div class="stat s-done"><div class="num">${st.done}</div><div class="lbl">완독 (올해 ${st.doneThisYear})</div></div>
        <div class="stat s-star"><div class="num">${st.avg ? st.avg.toFixed(1) : '–'}</div><div class="lbl">평균 별점</div></div>
      </div>`;

    if (books.length === 0) {
      $('#view').innerHTML = `<div class="wrap">${headHtml}
        <div class="empty">
          <div class="ic">📚</div>
          <h3>아직 서재가 비어 있어요</h3>
          <p>책을 검색해서 첫 번째 책을 추가해 보세요.</p>
          <a class="btn btn-primary" href="#/search">책 검색하러 가기</a>
        </div></div>`;
      return;
    }

    const toolbar = `
      <div class="toolbar">
        <div class="search-box">
          <input class="input" id="libSearch" type="search" placeholder="내 서재에서 제목·저자 검색" value="${escapeHtml(libState.q)}" />
        </div>
        <span class="toolbar-label">정렬</span>
        <select class="select" id="libSort">
          <option value="recent" ${libState.sort==='recent'?'selected':''}>최근 추가순</option>
          <option value="rating" ${libState.sort==='rating'?'selected':''}>별점 높은순</option>
          <option value="title"  ${libState.sort==='title' ?'selected':''}>제목 가나다순</option>
        </select>
        <span class="toolbar-label">상태</span>
        <select class="select" id="libStatus">
          <option value="all"     ${libState.status==='all'?'selected':''}>전체</option>
          <option value="want"    ${libState.status==='want'?'selected':''}>읽고 싶은</option>
          <option value="reading" ${libState.status==='reading'?'selected':''}>읽는 중</option>
          <option value="done"    ${libState.status==='done'?'selected':''}>완독</option>
        </select>
        <span class="toolbar-label">별점</span>
        <select class="select" id="libRating">
          <option value="0" ${libState.minRating===0?'selected':''}>전체</option>
          <option value="4" ${libState.minRating===4?'selected':''}>★ 4 이상</option>
          <option value="3" ${libState.minRating===3?'selected':''}>★ 3 이상</option>
          <option value="2" ${libState.minRating===2?'selected':''}>★ 2 이상</option>
        </select>
      </div>`;

    const list = applyFilters(books);
    const gridHtml = list.length
      ? `<div class="book-grid">${list.map(bookCardHtml).join('')}</div>`
      : `<div class="empty"><div class="ic">🔍</div><h3>조건에 맞는 책이 없어요</h3><p>검색어나 필터를 바꿔 보세요.</p></div>`;

    $('#view').innerHTML = `<div class="wrap">${headHtml}${toolbar}${gridHtml}</div>`;

    // 이벤트
    let t;
    $('#libSearch').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { libState.q = e.target.value; refreshLibraryGrid(); }, 200);
    });
    $('#libSort').addEventListener('change', e => { libState.sort = e.target.value; refreshLibraryGrid(); });
    $('#libStatus').addEventListener('change', e => { libState.status = e.target.value; refreshLibraryGrid(); });
    $('#libRating').addEventListener('change', e => { libState.minRating = Number(e.target.value); refreshLibraryGrid(); });

    bindCardClicks();
  }

  // 그리드만 다시 그려서 입력 포커스 유지
  function refreshLibraryGrid() {
    const list = applyFilters(Store.getLibrary());
    const wrap = $('#view .wrap');
    let grid = wrap.querySelector('.book-grid') || wrap.querySelector('.empty:last-child');
    const newHtml = list.length
      ? `<div class="book-grid">${list.map(bookCardHtml).join('')}</div>`
      : `<div class="empty"><div class="ic">🔍</div><h3>조건에 맞는 책이 없어요</h3><p>검색어나 필터를 바꿔 보세요.</p></div>`;
    grid.outerHTML = newHtml;
    bindCardClicks();
  }

  function bookCardHtml(book) {
    return `
      <article class="book-card ${STATUS[book.status].cls}" data-id="${book.id}" tabindex="0" role="button">
        <span class="spine"></span>
        <div class="book-cover">${coverHtml(book)}</div>
        <div class="book-body">
          <div class="book-title">${escapeHtml(book.title)}</div>
          <div class="book-author">${escapeHtml(authorsText(book))}</div>
          <div class="book-meta-row">
            ${statusBadge(book.status)}
            ${book.rating > 0 ? starsHtml(book.rating) : ''}
          </div>
        </div>
      </article>`;
  }

  function bindCardClicks() {
    $all('.book-card').forEach(card => {
      const go = () => navigate('#/book/' + card.dataset.id);
      card.addEventListener('click', go);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  /* ===================== 화면: 책 검색 ===================== */

  let searchState = { results: [], lastQuery: '' };

  function renderSearch() {
    $('#view').innerHTML = `
      <div class="wrap">
        <div class="page-head">
          <div class="eyebrow">Find a book</div>
          <h1>책 검색</h1>
          <p>제목·저자·키워드로 검색해 서재에 담아 보세요.</p>
        </div>

        <div class="toolbar">
          <div class="search-box">
            <input class="input" id="searchInput" type="search" placeholder="예) 데미안, 김초엽, 정세랑…" value="${escapeHtml(searchState.lastQuery)}" />
          </div>
          <button class="btn btn-primary" id="searchBtn">검색</button>
          <button class="btn btn-ghost" id="manualBtn">직접 추가</button>
        </div>

        <div id="searchResults">${searchState.results.length ? resultsHtml(searchState.results) : ''}</div>
      </div>`;

    const input = $('#searchInput');
    const doSearch = () => runSearch(input.value);
    $('#searchBtn').addEventListener('click', doSearch);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    $('#manualBtn').addEventListener('click', openManualAdd);
    input.focus();
    if (searchState.results.length) bindResultActions();
  }

  async function runSearch(query) {
    const q = (query || '').trim();
    if (!q) { toast('검색어를 입력해 주세요.', 'warn'); return; }
    searchState.lastQuery = q;
    const box = $('#searchResults');
    box.innerHTML = `<div class="loading-center"><span class="spinner"></span> 검색 중…</div>`;
    try {
      const results = await BookAPI.searchBooks(q);
      searchState.results = results;
      if (results.length === 0) {
        box.innerHTML = `<div class="empty"><div class="ic">🤔</div>
          <h3>'${escapeHtml(q)}' 검색 결과가 없어요</h3>
          <p>다른 검색어로 시도하거나, 직접 추가로 책을 등록할 수 있어요.</p>
          <button class="btn btn-ghost" id="manualBtn2">직접 추가</button></div>`;
        $('#manualBtn2').addEventListener('click', openManualAdd);
        return;
      }
      box.innerHTML = resultsHtml(results);
      bindResultActions();
    } catch (err) {
      console.error(err);
      box.innerHTML = `<div class="empty"><div class="ic">⚠️</div>
        <h3>검색 중 문제가 발생했어요</h3>
        <p>잠시 후 다시 시도해 주세요. (네트워크 또는 API 요청 한도)</p></div>`;
    }
  }

  function resultsHtml(results) {
    return `<div class="result-list">${results.map((b, i) => `
      <div class="result" data-idx="${i}">
        <div class="thumb">${b.thumbnail
          ? `<img src="${escapeHtml(b.thumbnail)}" alt="" loading="lazy" />`
          : `<div class="no-cover">${escapeHtml(b.title)}</div>`}</div>
        <div class="info">
          <h3>${escapeHtml(b.title)}</h3>
          <div class="by">${escapeHtml(b.authors.length ? b.authors.join(', ') : '저자 미상')}</div>
          <div class="pub">${escapeHtml([b.publisher, b.publishedDate].filter(Boolean).join(' · '))}</div>
        </div>
        <div class="actions">
          <button class="btn btn-primary btn-sm" data-add="${i}">＋ 서재에 추가</button>
        </div>
      </div>`).join('')}</div>`;
  }

  function bindResultActions() {
    $all('[data-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const book = searchState.results[Number(btn.dataset.add)];
        askStatusAndAdd(book);
      });
    });
  }

  // 상태를 고른 뒤 서재에 추가(중복 확인 포함)
  function askStatusAndAdd(candidate) {
    const dup = Store.findDuplicate(candidate);
    if (dup) {
      toast('이미 서재에 담긴 책이에요.', 'warn');
      return;
    }
    openModal(`
      <h3>서재에 추가</h3>
      <p>'${escapeHtml(candidate.title)}'을(를) 어떤 상태로 담을까요?</p>
      <div class="status-pick" id="addStatus">
        <button data-st="want"    class="st-want">읽고 싶은</button>
        <button data-st="reading" class="st-reading">읽는 중</button>
        <button data-st="done"    class="st-done">완독</button>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="mCancel">취소</button>
      </div>`);
    $('#mCancel').onclick = closeModal;
    $all('#addStatus button').forEach(b => {
      b.onclick = () => {
        Store.addBook(candidate, b.dataset.st);
        closeModal();
        toast(`'${candidate.title}'을(를) 서재에 담았어요.`, 'ok');
      };
    });
  }

  // API에 없는 책: 직접 추가
  function openManualAdd() {
    openModal(`
      <h3>책 직접 추가</h3>
      <p>검색에 없는 책을 직접 입력해 등록할 수 있어요.</p>
      <div class="field">
        <label for="mTitle">제목 *</label>
        <input class="input" id="mTitle" type="text" placeholder="책 제목" />
        <div class="field-error" data-for="mTitle"></div>
      </div>
      <div class="field">
        <label for="mAuthor">저자</label>
        <input class="input" id="mAuthor" type="text" placeholder="쉼표로 여러 명 입력 가능" />
      </div>
      <div class="field">
        <label for="mPublisher">출판사 (선택)</label>
        <input class="input" id="mPublisher" type="text" />
      </div>
      <div class="field">
        <label>초기 상태</label>
        <div class="status-pick" id="mStatus">
          <button type="button" data-st="want"    class="st-want active">읽고 싶은</button>
          <button type="button" data-st="reading" class="st-reading">읽는 중</button>
          <button type="button" data-st="done"    class="st-done">완독</button>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="mCancel">취소</button>
        <button class="btn btn-primary" id="mSave">추가하기</button>
      </div>`);

    let chosen = 'want';
    $all('#mStatus button').forEach(b => b.onclick = () => {
      chosen = b.dataset.st;
      $all('#mStatus button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
    $('#mCancel').onclick = closeModal;
    $('#mSave').onclick = () => {
      const title = $('#mTitle').value.trim();
      if (!title) { $('.field-error[data-for="mTitle"]').textContent = '제목은 필수입니다.'; return; }
      const authors = $('#mAuthor').value.split(',').map(s => s.trim()).filter(Boolean);
      const candidate = { source: 'manual', title, authors, publisher: $('#mPublisher').value.trim() };
      const dup = Store.findDuplicate(candidate);
      if (dup) { $('.field-error[data-for="mTitle"]').textContent = '이미 서재에 있는 책이에요.'; return; }
      Store.addBook(candidate, chosen);
      closeModal();
      toast(`'${title}'을(를) 서재에 담았어요.`, 'ok');
    };
  }

  /* ===================== 화면: 책 상세 ===================== */

  let entryTab = 'memo'; // 'memo' | 'quote'

  function renderDetail(id) {
    const book = Store.getBook(id);
    if (!book) {
      $('#view').innerHTML = `<div class="wrap"><div class="empty"><div class="ic">❓</div>
        <h3>책을 찾을 수 없어요</h3><a class="btn btn-ghost" href="#/library">내 서재로</a></div></div>`;
      return;
    }

    const entries = (book.entries || []).slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    $('#view').innerHTML = `
      <div class="wrap">
        <a class="back-link" href="#/library">← 내 서재</a>

        <div class="detail-top">
          <div class="detail-cover">${coverHtml(book)}</div>
          <div class="detail-head">
            ${statusBadge(book.status)}
            <h1>${escapeHtml(book.title)}</h1>
            <div class="by">${escapeHtml(authorsText(book))}</div>
            <div class="pub">${escapeHtml([book.publisher, book.publishedDate].filter(Boolean).join(' · '))}</div>

            <div class="control-card">
              <h4>독서 상태</h4>
              <div class="status-pick" id="statusPick">
                <button data-st="want"    class="st-want ${book.status==='want'?'active':''}">읽고 싶은</button>
                <button data-st="reading" class="st-reading ${book.status==='reading'?'active':''}">읽는 중</button>
                <button data-st="done"    class="st-done ${book.status==='done'?'active':''}">완독</button>
              </div>
              <div class="date-note">
                <span>시작일 <b>${book.startDate ? fmtDate(book.startDate) : '–'}</b></span>
                <span>완료일 <b>${book.finishDate ? fmtDate(book.finishDate) : '–'}</b></span>
                <span>추가일 <b>${fmtDate(book.addedAt)}</b></span>
              </div>
            </div>

            <div class="control-card">
              <h4>별점</h4>
              <div id="starInput">${starInputHtml(book.rating)}</div>
            </div>
          </div>
        </div>

        <!-- 감상문 -->
        <section class="section">
          <div class="section-head">
            <h2>감상문</h2>
            <button class="btn btn-ghost btn-sm" id="editReview">${book.review ? '수정' : '작성'}</button>
          </div>
          <div class="review-box" id="reviewBox">
            ${book.review
              ? `<div class="review-display">${escapeHtml(book.review)}</div>`
              : `<div class="review-empty">완독 후의 긴 감상을 남겨 보세요.</div>`}
          </div>
        </section>

        <!-- 메모 & 인용구 -->
        <section class="section">
          <div class="section-head">
            <h2>메모 &amp; 인용구</h2>
            <span class="count">${entries.length}개</span>
          </div>

          <div class="entry-tabs" id="entryTabs">
            <button data-tab="memo"  class="${entryTab==='memo'?'active':''}">메모</button>
            <button data-tab="quote" class="${entryTab==='quote'?'active':''}">인용구</button>
          </div>
          <div class="entry-form" id="entryForm">${entryFormHtml(entryTab)}</div>

          <div id="timeline">${timelineHtml(entries)}</div>
        </section>

        <section class="section">
          <button class="btn btn-danger" id="deleteBook">이 책을 서재에서 삭제</button>
        </section>
      </div>`;

    bindDetailEvents(book);
  }

  // 클릭 가능한 별점 위젯
  function starInputHtml(rating) {
    return `
      <div class="star-input">${starInputCellsHtml(rating)}</div>
      <span class="rating-num" id="ratingNum">${rating > 0 ? rating.toFixed(1) + '점' : '미평가'}</span>
      ${rating > 0 ? `<button class="btn btn-ghost btn-sm" id="clearRating" style="margin-left:10px">평가 취소</button>` : ''}`;
  }
  // 별 5칸 렌더(반쪽 클릭 영역 포함)
  function starInputCellsHtml(rating) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
      const color =
        rating >= i ? 'var(--star)' :
        rating >= i - 0.5 ? 'transparent' : 'var(--line-strong)';
      const half = rating >= i - 0.5 && rating < i;
      html += `
        <span class="star-cell" data-i="${i}">
          <span class="star-glyph" style="color:${color}">★</span>
          ${half ? `<span class="star-glyph" style="color:var(--star);clip-path:inset(0 50% 0 0)">★</span>` : ''}
          <span class="half-l" data-val="${(i - 0.5)}"></span>
          <span class="half-r" data-val="${i}"></span>
        </span>`;
    }
    return html;
  }

  function entryFormHtml(tab) {
    if (tab === 'quote') {
      return `
        <div class="row">
          <textarea class="textarea" id="entryText" placeholder="기억하고 싶은 문장을 적어 주세요"></textarea>
          <div class="page-field">
            <input class="input" id="entryPage" type="text" inputmode="numeric" placeholder="쪽수" />
          </div>
        </div>
        <div style="margin-top:10px;text-align:right">
          <button class="btn btn-primary btn-sm" id="addEntryBtn">인용구 저장</button>
        </div>`;
    }
    return `
      <textarea class="textarea" id="entryText" placeholder="떠오른 생각이나 메모를 남겨 보세요 (작성일은 자동 기록됩니다)"></textarea>
      <div style="margin-top:10px;text-align:right">
        <button class="btn btn-primary btn-sm" id="addEntryBtn">메모 저장</button>
      </div>`;
  }

  function timelineHtml(entries) {
    if (!entries.length) {
      return `<div class="empty" style="margin-top:16px"><div class="ic">✍️</div>
        <h3>아직 기록이 없어요</h3><p>첫 메모나 인용구를 남겨 보세요.</p></div>`;
    }
    return `<div class="timeline">${entries.map(e => `
      <div class="entry kind-${e.kind}" data-eid="${e.id}">
        <div class="entry-card ${e.kind === 'quote' ? 'quote' : ''}">
          <div class="entry-meta">
            <span class="entry-kind ${e.kind}">${e.kind === 'quote' ? '인용구' : '메모'}</span>
            ${e.kind === 'quote' && e.page ? `<span class="entry-page">p.${escapeHtml(e.page)}</span>` : ''}
            <span class="entry-date">${fmtDateTime(e.createdAt)}</span>
            <span class="entry-actions">
              <button data-edit="${e.id}">수정</button>
              <button data-del="${e.id}">삭제</button>
            </span>
          </div>
          <div class="entry-text">${escapeHtml(e.text)}</div>
        </div>
      </div>`).join('')}</div>`;
  }

  function bindDetailEvents(book) {
    // 상태 변경
    $all('#statusPick button').forEach(b => b.onclick = () => {
      Store.changeStatus(book.id, b.dataset.st);
      toast(`상태를 '${STATUS[b.dataset.st].label}'(으)로 바꿨어요.`, 'ok');
      renderDetail(book.id);
    });

    // 별점(반쪽 단위)
    bindStarInput(book);

    // 감상문 편집
    $('#editReview').onclick = () => openReviewEditor(book);

    // 기록 탭 전환
    $all('#entryTabs button').forEach(b => b.onclick = () => {
      entryTab = b.dataset.tab;
      $all('#entryTabs button').forEach(x => x.classList.toggle('active', x === b));
      $('#entryForm').innerHTML = entryFormHtml(entryTab);
      bindEntryForm(book);
    });
    bindEntryForm(book);

    // 기록 수정/삭제
    bindTimeline(book);

    // 책 삭제
    $('#deleteBook').onclick = async () => {
      const ok = await confirmModal({
        title: '책 삭제',
        message: `'${book.title}'을(를) 서재에서 삭제할까요? 작성한 메모와 감상문도 함께 사라집니다.`,
        confirmText: '삭제',
      });
      if (ok) { Store.removeBook(book.id); toast('서재에서 삭제했어요.', 'ok'); navigate('#/library'); }
    };
  }

  function bindStarInput(book) {
    const wrap = $('#starInput');
    function rebind() {
      $all('#starInput .half-l, #starInput .half-r').forEach(half => {
        half.onclick = () => {
          const val = Number(half.dataset.val);
          Store.updateBook(book.id, { rating: val });
          book.rating = val;
          wrap.innerHTML = starInputHtml(val);
          rebind();
          const cl = $('#clearRating'); if (cl) cl.onclick = clear;
          toast(`별점 ${val.toFixed(1)}점`, 'ok');
        };
      });
    }
    function clear() {
      Store.updateBook(book.id, { rating: 0 });
      book.rating = 0;
      wrap.innerHTML = starInputHtml(0);
      rebind();
    }
    rebind();
    const cl = $('#clearRating'); if (cl) cl.onclick = clear;
  }

  function bindEntryForm(book) {
    const btn = $('#addEntryBtn');
    if (!btn) return;
    btn.onclick = () => {
      const text = $('#entryText').value.trim();
      if (!text) { toast('내용을 입력해 주세요.', 'warn'); return; }
      const page = entryTab === 'quote' ? ($('#entryPage') ? $('#entryPage').value.trim() : '') : '';
      Store.addEntry(book.id, { kind: entryTab, text, page });
      toast(entryTab === 'quote' ? '인용구를 저장했어요.' : '메모를 저장했어요.', 'ok');
      // 타임라인만 갱신
      const updated = Store.getBook(book.id);
      const entries = (updated.entries || []).slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      $('#timeline').innerHTML = timelineHtml(entries);
      $('.section .count').textContent = entries.length + '개';
      $('#entryForm').innerHTML = entryFormHtml(entryTab);
      bindEntryForm(book);
      bindTimeline(book);
    };
  }

  function bindTimeline(book) {
    $all('[data-del]').forEach(b => b.onclick = async () => {
      const ok = await confirmModal({ title: '기록 삭제', message: '이 기록을 삭제할까요?', confirmText: '삭제' });
      if (!ok) return;
      Store.removeEntry(book.id, b.dataset.del);
      refreshTimeline(book);
      toast('삭제했어요.', 'ok');
    });
    $all('[data-edit]').forEach(b => b.onclick = () => openEntryEditor(book, b.dataset.edit));
  }

  function refreshTimeline(book) {
    const updated = Store.getBook(book.id);
    const entries = (updated.entries || []).slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    $('#timeline').innerHTML = timelineHtml(entries);
    const cnt = $('.section .count'); if (cnt) cnt.textContent = entries.length + '개';
    bindTimeline(book);
  }

  function openEntryEditor(book, entryId) {
    const entry = (Store.getBook(book.id).entries || []).find(e => e.id === entryId);
    if (!entry) return;
    openModal(`
      <h3>${entry.kind === 'quote' ? '인용구' : '메모'} 수정</h3>
      <div class="field">
        <textarea class="textarea" id="editText">${escapeHtml(entry.text)}</textarea>
      </div>
      ${entry.kind === 'quote' ? `
        <div class="field">
          <label for="editPage">쪽수</label>
          <input class="input" id="editPage" type="text" value="${escapeHtml(entry.page)}" />
        </div>` : ''}
      <div class="modal-actions">
        <button class="btn btn-ghost" id="mCancel">취소</button>
        <button class="btn btn-primary" id="mSave">저장</button>
      </div>`);
    $('#mCancel').onclick = closeModal;
    $('#mSave').onclick = () => {
      const text = $('#editText').value.trim();
      if (!text) { toast('내용을 입력해 주세요.', 'warn'); return; }
      const patch = { text };
      if (entry.kind === 'quote') patch.page = $('#editPage').value.trim();
      Store.updateEntry(book.id, entryId, patch);
      closeModal();
      refreshTimeline(book);
      toast('수정했어요.', 'ok');
    };
  }

  function openReviewEditor(book) {
    openModal(`
      <h3>감상문 ${book.review ? '수정' : '작성'}</h3>
      <div class="field">
        <textarea class="textarea" id="reviewText" style="min-height:200px" placeholder="이 책을 읽고 느낀 점을 자유롭게 적어 보세요.">${escapeHtml(book.review)}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="mCancel">취소</button>
        <button class="btn btn-primary" id="mSave">저장</button>
      </div>`);
    $('#mCancel').onclick = closeModal;
    $('#mSave').onclick = () => {
      const review = $('#reviewText').value.trim();
      Store.updateBook(book.id, { review });
      closeModal();
      toast('감상문을 저장했어요.', 'ok');
      renderDetail(book.id);
    };
  }

  /* ===================== 로그아웃 / 초기화 ===================== */

  function bindGlobal() {
    $('#logoutBtn').addEventListener('click', () => {
      Store.clearSession();
      toast('로그아웃 되었습니다.', 'ok');
      navigate('#/library');
      router();
    });
  }

  /* ===================== 부팅 ===================== */

  function init() {
    bindGlobal();
    window.addEventListener('hashchange', router);
    router();
  }

  return { init, toast, navigate };
})();

document.addEventListener('DOMContentLoaded', App.init);
