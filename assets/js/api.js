/* =========================================================
   api.js — 도서 검색 API 계층
   ---------------------------------------------------------
   Google Books API를 사용합니다.
   - 서버 없이 브라우저에서 직접 호출 가능(JavaScript/REST)
   - 공개 검색은 API 키 없이도 동작(단, 키 없으면 요청 한도가 더 빡빡함)
     출처: Google for Developers — Books API "Getting Started"
            https://developers.google.com/books/docs/v1/getting_started

   ※ 한국어 도서 검색 품질을 더 높이고 싶다면 아래 '카카오 책 검색 API'
     안내(README 참고)를 따라 searchBooks를 교체할 수 있습니다.
   ========================================================= */

const BookAPI = (() => {
  const ENDPOINT = 'https://www.googleapis.com/books/v1/volumes';

  // 한 권의 Google 응답을 우리 앱이 쓰는 형태로 정규화
  function normalize(item) {
    const v = item.volumeInfo || {};
    let thumb = '';
    if (v.imageLinks) {
      thumb = v.imageLinks.thumbnail || v.imageLinks.smallThumbnail || '';
      thumb = thumb.replace(/^http:/, 'https:'); // 혼합 콘텐츠 방지
    }
    const isbn = (v.industryIdentifiers || [])
      .filter(x => x.type === 'ISBN_13' || x.type === 'ISBN_10')
      .map(x => x.identifier)[0] || '';

    return {
      source: 'google',
      volumeId: item.id,
      title: v.title || '(제목 없음)',
      authors: v.authors || [],
      publisher: v.publisher || '',
      publishedDate: v.publishedDate || '',
      thumbnail: thumb,
      isbn,
    };
  }

  /**
   * 책 검색
   * @param {string} query 검색어
   * @param {number} maxResults 최대 결과 수(기본 20)
   * @returns {Promise<Array>} 정규화된 도서 배열
   */
  async function searchBooks(query, maxResults = 20) {
    const q = (query || '').trim();
    if (!q) return [];

    const url = `${ENDPOINT}?q=${encodeURIComponent(q)}` +
                `&maxResults=${maxResults}&printType=books&langRestrict=ko`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`검색 요청 실패 (HTTP ${res.status})`);
    }
    const data = await res.json();
    if (!data.items) return [];
    return data.items.map(normalize);
  }

  return { searchBooks };
})();
