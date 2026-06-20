# 책갈피 · 나의 독서 기록 아카이브

읽은 책과 읽고 있는 책을 한곳에 모아 **메모 · 별점 · 통계**로 관리하는 개인 독서 아카이브 웹사이트입니다.
별도의 빌드 과정 없이 **GitHub Pages**에 그대로 올려서 바로 호스팅할 수 있는 순수 정적 사이트(HTML/CSS/JS)입니다.

---

## 1. 파일 구조

```
readlog/
├── index.html              ← 사이트 진입점 (반드시 최상위에 위치)
├── .nojekyll               ← GitHub Pages가 Jekyll로 처리하지 않도록 하는 빈 파일
├── README.md
└── assets/
    ├── css/
    │   └── styles.css      ← 전체 디자인/스타일
    └── js/
        ├── store.js        ← 데이터 저장(localStorage) — 사용자/서재/기록
        ├── api.js          ← 도서 검색(Google Books API)
        ├── auth.js         ← 회원가입/로그인 화면
        └── app.js          ← 라우팅 + 서재/검색/상세 화면
```

---

## 2. GitHub Pages에 올리는 방법

> 정식 출처: GitHub Docs — *Quickstart for GitHub Pages*
> <https://docs.github.com/en/pages/quickstart>

1. GitHub에서 **공개(public) 저장소**를 새로 만듭니다.
   (무료 계정에서 브랜치 배포를 쓰려면 저장소가 공개여야 합니다. 비공개로 하려면 GitHub Actions 방식이 필요합니다.)
2. 이 폴더(`index.html`이 들어 있는 폴더)의 **내용물**을 저장소 최상위에 업로드합니다.
   - 웹에서: 저장소 화면 → **Add file → Upload files** → 폴더 안 파일들을 드래그 → **Commit changes**
   - 또는 git으로:
     ```bash
     git init
     git add .
     git commit -m "독서 기록 아카이브"
     git branch -M main
     git remote add origin https://github.com/<사용자명>/<저장소명>.git
     git push -u origin main
     ```
   - ⚠️ `index.html`이 반드시 **저장소 최상위(root)** 에 있어야 합니다.
3. 저장소 **Settings → Pages**로 이동합니다.
4. **Build and deployment → Source**에서 **Deploy from a branch**를 선택합니다.
5. **Branch**를 `main` / `/(root)`로 지정하고 **Save**를 누릅니다.
6. 몇 분(최대 10분) 기다리면 사이트가 다음 주소로 열립니다:
   ```
   https://<사용자명>.github.io/<저장소명>/
   ```

---

## 3. 구현된 기능 (PRD 대비)

| PRD 핵심 기능 | 구현 내용 |
|---|---|
| **회원/로그인** | 회원가입(이메일·비밀번호·닉네임), 로그인, 로그아웃 |
| **책 검색 및 추가** | Google Books로 검색 → 초기 상태 지정 후 서재에 추가 / 중복 안내 / API에 없는 책 **직접 추가** |
| **독서 상태 관리** | 읽고 싶은 · 읽는 중 · 완독 / 상태 변경 시 **시작일·완료일 자동 기록** |
| **메모·감상·인용구** | 메모(작성일 자동) · 감상문(긴 글) · 인용구(+쪽수) / 수정·삭제 / **시간순 모아보기** |
| **별점 평가** | 0.5점 단위 1~5점 별점 |
| **내 서재 검색** | 제목·저자 검색 / 정렬(최근 추가·별점 높은순·제목 가나다순) / 필터(상태별·별점별) / 통계 요약 |

---

## 4. 데이터 저장 방식과 한계 ⚠️

이 사이트는 서버가 없는 **정적 사이트**라서, 모든 데이터는 브라우저의 **`localStorage`** 에 저장됩니다.
과제 시연·개인 사용에는 충분하지만 다음 한계가 있습니다.

- **기기/브라우저마다 데이터가 따로** 저장됩니다. (다른 PC에서 로그인해도 서재가 비어 있음)
- 브라우저 데이터를 지우면 기록도 사라집니다.
- **로그인은 진짜 보안이 아닙니다.** 서버가 없어 비밀번호를 안전하게 보관할 수 없으므로,
  `store.js`는 비밀번호를 평문으로 저장하지 않는 **최소한의 조치**만 합니다.
  실제 서비스에서는 **백엔드 서버 + 안전한 해시(bcrypt 등)** 가 반드시 필요합니다.

> 데이터를 여러 기기에서 공유하려면 Firebase, Supabase 같은 **BaaS(백엔드 서비스)** 를 붙이는 것이 다음 단계입니다.

---

## 5. 도서 검색 API 안내

기본값은 **Google Books API**입니다.
- 서버 없이 브라우저에서 직접 호출할 수 있습니다.
  (출처: Google for Developers — *Books API Getting Started*, <https://developers.google.com/books/docs/v1/getting_started>)
- **API 키 없이도** 공개 검색이 동작합니다. 다만 키가 없으면 요청 한도가 더 빡빡해
  단시간에 많이 검색하면 일시적으로 막힐 수 있습니다.

### (선택) 한국어 검색 품질을 높이려면 — 카카오 책 검색 API
Google Books는 한국 도서 정보가 부족할 수 있습니다. 더 정확한 국내 도서 검색이 필요하면
[카카오 디벨로퍼스](https://developers.kakao.com)에서 **REST API 키**를 발급받아 `assets/js/api.js`의
`searchBooks`를 아래처럼 교체하면 됩니다.

```js
async function searchBooks(query, maxResults = 20) {
  const q = (query || '').trim();
  if (!q) return [];
  const res = await fetch(
    `https://dapi.kakao.com/v3/search/book?query=${encodeURIComponent(q)}&size=${maxResults}`,
    { headers: { Authorization: 'KakaoAK 여기에_REST_API_키' } }
  );
  if (!res.ok) throw new Error(`검색 실패 (HTTP ${res.status})`);
  const data = await res.json();
  return (data.documents || []).map(d => ({
    source: 'kakao',
    volumeId: d.isbn || d.url,
    title: d.title,
    authors: d.authors || [],
    publisher: d.publisher || '',
    publishedDate: (d.datetime || '').slice(0, 10),
    thumbnail: d.thumbnail || '',
    isbn: (d.isbn || '').split(' ').pop() || '',
  }));
}
```

> ⚠️ 정적 사이트에서는 키가 코드에 노출됩니다. 카카오 콘솔에서 **사용할 도메인(예: `https://<사용자명>.github.io`)을 등록**해
> 키 사용을 제한하고, 과제/개인용으로만 쓰세요.

---

## 6. 로컬에서 미리 보기 (선택)

GitHub에 올리기 전 컴퓨터에서 확인하려면, `index.html`을 더블클릭해도 대부분 동작하지만
도서 검색은 `file://`에서 막힐 수 있으므로 간단한 로컬 서버를 쓰는 것을 권장합니다.

```bash
# 파이썬이 있다면 폴더에서:
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```
