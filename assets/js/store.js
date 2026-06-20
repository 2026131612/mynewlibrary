/* =========================================================
   store.js — 데이터 저장 계층
   ---------------------------------------------------------
   GitHub Pages는 정적 호스팅이라 서버/데이터베이스가 없습니다.
   따라서 모든 데이터를 브라우저의 localStorage에 보관합니다.
   (= 같은 브라우저에서만 데이터가 유지되며, 기기를 바꾸면 사라집니다.)

   저장 구조
     readlog_db = {
       users:     { [email]: { email, nickname, password, createdAt } },
       libraries: { [email]: [ book, book, ... ] }
     }
     readlog_session = "로그인한 사용자의 email"
   ========================================================= */

const Store = (() => {
  const DB_KEY = 'readlog_db';
  const SESSION_KEY = 'readlog_session';

  /* ---------- 내부: DB 읽기/쓰기 ---------- */
  function loadDB() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return { users: {}, libraries: {} };
      const db = JSON.parse(raw);
      db.users = db.users || {};
      db.libraries = db.libraries || {};
      return db;
    } catch (e) {
      console.error('DB 로드 실패, 초기화합니다.', e);
      return { users: {}, libraries: {} };
    }
  }
  function saveDB(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  /* ---------- 유틸 ---------- */
  function uid() {
    return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ⚠️ 데모용 간단 해시입니다. 진짜 보안용 암호화가 아닙니다.
  //    정적 사이트에는 서버가 없어 안전한 인증을 구현할 수 없으므로,
  //    비밀번호를 평문 그대로 저장하지 않는 최소한의 조치일 뿐입니다.
  //    실제 서비스에는 반드시 서버 + 안전한 해시(bcrypt 등)를 쓰세요.
  function pseudoHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return 'h' + (h >>> 0).toString(16) + ':' + str.length;
  }

  /* ---------- 사용자 ---------- */
  function getUser(email) {
    return loadDB().users[email] || null;
  }

  function createUser({ email, password, nickname }) {
    const db = loadDB();
    email = email.trim().toLowerCase();
    if (db.users[email]) {
      return { ok: false, error: '이미 가입된 이메일입니다.' };
    }
    db.users[email] = {
      email,
      nickname: nickname.trim(),
      password: pseudoHash(password),
      createdAt: new Date().toISOString(),
    };
    db.libraries[email] = [];
    saveDB(db);
    return { ok: true, user: db.users[email] };
  }

  function verifyUser(email, password) {
    email = email.trim().toLowerCase();
    const user = getUser(email);
    if (!user) return { ok: false, error: '가입되지 않은 이메일입니다.' };
    if (user.password !== pseudoHash(password)) {
      return { ok: false, error: '비밀번호가 일치하지 않습니다.' };
    }
    return { ok: true, user };
  }

  /* ---------- 세션 ---------- */
  function setSession(email) { localStorage.setItem(SESSION_KEY, email); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }
  function currentEmail() { return localStorage.getItem(SESSION_KEY); }
  function currentUser() {
    const email = currentEmail();
    return email ? getUser(email) : null;
  }

  /* ---------- 서재(책 목록) ---------- */
  function getLibrary() {
    const email = currentEmail();
    if (!email) return [];
    return loadDB().libraries[email] || [];
  }
  function saveLibrary(books) {
    const email = currentEmail();
    if (!email) return;
    const db = loadDB();
    db.libraries[email] = books;
    saveDB(db);
  }
  function getBook(id) {
    return getLibrary().find(b => b.id === id) || null;
  }

  // 중복 판정: 같은 Google 볼륨 ID이거나, (제목+저자)가 같으면 중복으로 간주
  function findDuplicate(candidate) {
    const norm = s => (s || '').replace(/\s+/g, '').toLowerCase();
    return getLibrary().find(b => {
      if (candidate.volumeId && b.volumeId && candidate.volumeId === b.volumeId) return true;
      return norm(b.title) === norm(candidate.title) &&
             norm((b.authors || []).join()) === norm((candidate.authors || []).join());
    }) || null;
  }

  function addBook(data, status) {
    const books = getLibrary();
    const now = new Date().toISOString();
    const book = {
      id: uid(),
      source: data.source || 'manual',
      volumeId: data.volumeId || null,
      title: data.title,
      authors: data.authors || [],
      publisher: data.publisher || '',
      publishedDate: data.publishedDate || '',
      thumbnail: data.thumbnail || '',
      isbn: data.isbn || '',
      status: status || 'want',
      rating: 0,            // 0 = 미평가, 0.5 단위 ~ 5
      startDate: status === 'reading' ? now : null,   // 읽는 중으로 추가 시 시작일 기록
      finishDate: status === 'done' ? now : null,     // 완독으로 추가 시 완료일 기록
      addedAt: now,
      review: '',           // 감상문(완독 후 긴 글)
      entries: [],          // 메모/인용구 목록
    };
    books.unshift(book);
    saveLibrary(books);
    return book;
  }

  function updateBook(id, patch) {
    const books = getLibrary();
    const idx = books.findIndex(b => b.id === id);
    if (idx === -1) return null;
    books[idx] = { ...books[idx], ...patch };
    saveLibrary(books);
    return books[idx];
  }

  function removeBook(id) {
    saveLibrary(getLibrary().filter(b => b.id !== id));
  }

  /* 상태 변경: 읽는 중 전환 시 시작일, 완독 전환 시 완료일을 (없으면) 기록 */
  function changeStatus(id, status) {
    const book = getBook(id);
    if (!book) return null;
    const now = new Date().toISOString();
    const patch = { status };
    if (status === 'reading' && !book.startDate) patch.startDate = now;
    if (status === 'done' && !book.finishDate) patch.finishDate = now;
    return updateBook(id, patch);
  }

  /* ---------- 기록(메모/인용구) ---------- */
  function addEntry(bookId, { kind, text, page }) {
    const book = getBook(bookId);
    if (!book) return null;
    const entry = {
      id: uid(),
      kind,                       // 'memo' | 'quote'
      text: text.trim(),
      page: kind === 'quote' ? (page || '') : '',
      createdAt: new Date().toISOString(),
    };
    const entries = [...(book.entries || []), entry];
    updateBook(bookId, { entries });
    return entry;
  }
  function updateEntry(bookId, entryId, patch) {
    const book = getBook(bookId);
    if (!book) return;
    const entries = (book.entries || []).map(e => e.id === entryId ? { ...e, ...patch } : e);
    updateBook(bookId, { entries });
  }
  function removeEntry(bookId, entryId) {
    const book = getBook(bookId);
    if (!book) return;
    updateBook(bookId, { entries: (book.entries || []).filter(e => e.id !== entryId) });
  }

  return {
    // 사용자/세션
    getUser, createUser, verifyUser,
    setSession, clearSession, currentEmail, currentUser,
    // 서재
    getLibrary, getBook, findDuplicate, addBook, updateBook, removeBook, changeStatus,
    // 기록
    addEntry, updateEntry, removeEntry,
  };
})();
