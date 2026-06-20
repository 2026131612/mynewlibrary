/* =========================================================
   auth.js — 인증 화면(회원가입 / 로그인 / 로그아웃)
   ========================================================= */

const Auth = (() => {

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /* 인증 화면 HTML 생성 (mode: 'login' | 'signup') */
  function render(mode = 'login') {
    return `
      <div class="auth-screen wrap">
        <div class="auth-card">
          <div class="auth-brand">
            <div class="brand-mark">❦</div>
            <h1>책갈피</h1>
            <p>읽은 책을 한곳에 모아두는 나만의 독서 아카이브</p>
          </div>

          <div class="auth-tabs">
            <button data-mode="login"  class="${mode === 'login' ? 'active' : ''}">로그인</button>
            <button data-mode="signup" class="${mode === 'signup' ? 'active' : ''}">회원가입</button>
          </div>

          <form id="authForm" novalidate>
            ${mode === 'signup' ? `
              <div class="field">
                <label for="nickname">닉네임</label>
                <input class="input" id="nickname" type="text" placeholder="서재에 표시될 이름" autocomplete="nickname" />
                <div class="field-error" data-for="nickname"></div>
              </div>` : ''}

            <div class="field">
              <label for="email">이메일</label>
              <input class="input" id="email" type="email" placeholder="you@example.com" autocomplete="email" />
              <div class="field-error" data-for="email"></div>
            </div>

            <div class="field">
              <label for="password">비밀번호</label>
              <input class="input" id="password" type="password" placeholder="6자 이상" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" />
              <div class="field-error" data-for="password"></div>
            </div>

            <button type="submit" class="btn btn-primary btn-block">
              ${mode === 'signup' ? '계정 만들기' : '로그인'}
            </button>
          </form>

          <p class="auth-switch">
            ${mode === 'signup'
              ? '이미 계정이 있으신가요? <button data-mode="login">로그인</button>'
              : '아직 계정이 없으신가요? <button data-mode="signup">회원가입</button>'}
          </p>
        </div>
      </div>`;
  }

  /* 화면이 그려진 후 이벤트 연결 */
  function bind(mode, onSuccess) {
    const root = document.getElementById('view');

    // 탭/전환 버튼
    root.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        root.innerHTML = render(btn.dataset.mode);
        bind(btn.dataset.mode, onSuccess);
      });
    });

    const form = root.querySelector('#authForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearErrors(root);

      const email = root.querySelector('#email').value.trim();
      const password = root.querySelector('#password').value;
      const nickname = mode === 'signup' ? root.querySelector('#nickname').value.trim() : '';

      // ----- 검증 -----
      let hasError = false;
      if (mode === 'signup' && nickname.length < 1) {
        setError(root, 'nickname', '닉네임을 입력해 주세요.'); hasError = true;
      }
      if (!isValidEmail(email)) {
        setError(root, 'email', '올바른 이메일 형식이 아닙니다.'); hasError = true;
      }
      if (password.length < 6) {
        setError(root, 'password', '비밀번호는 6자 이상이어야 합니다.'); hasError = true;
      }
      if (hasError) return;

      // ----- 처리 -----
      if (mode === 'signup') {
        const r = Store.createUser({ email, password, nickname });
        if (!r.ok) { setError(root, 'email', r.error); return; }
        Store.setSession(email);
        App.toast(`환영합니다, ${nickname}님!`, 'ok');
        onSuccess();
      } else {
        const r = Store.verifyUser(email, password);
        if (!r.ok) {
          const field = r.error.includes('비밀번호') ? 'password' : 'email';
          setError(root, field, r.error);
          return;
        }
        Store.setSession(email);
        App.toast(`다시 오셨네요, ${r.user.nickname}님!`, 'ok');
        onSuccess();
      }
    });
  }

  function setError(root, field, msg) {
    const el = root.querySelector(`.field-error[data-for="${field}"]`);
    if (el) el.textContent = msg;
  }
  function clearErrors(root) {
    root.querySelectorAll('.field-error').forEach(el => el.textContent = '');
  }

  return { render, bind, isValidEmail };
})();
