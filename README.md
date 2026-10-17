# OM-Share

AI 채팅에서 나온 Markdown/HTML을 붙여넣거나 파일로 올리면, 이 리포에 커밋되고 GitHub Pages 링크를 돌려주는 도구입니다.
서버 없이 Pages(정적 호스팅)와 GitHub REST API만 사용하므로 PC·모바일 브라우저 어디서나 동작합니다.

## 사용법

1. 이 리포의 Pages 주소(도구 페이지)를 엽니다.
2. 처음 한 번 **설정**에 Personal Access Token(classic)을 넣고 "저장하고 연결 확인"을 누릅니다.
   권한은 공개 리포면 `public_repo` 하나면 되고, 비공개 리포에 설치했다면 `repo`가 필요합니다.
3. 내용을 붙여넣거나 파일을 고르고 **올리기**를 누르면 링크가 복사됩니다. Pages 반영까지 1분 안팎이 걸립니다.

팀원은 이 리포의 collaborator(쓰기 권한)로 추가한 뒤, 각자 본인 토큰을 넣어 씁니다.

## 다른 GitHub에 설치하기

리포를 통째로 원하는 GitHub(github.com 또는 GitHub Enterprise Server)에 올리고,
Settings → Pages에서 **브랜치 기본 브랜치 / 폴더 `/`(root)** 를 선택하면 됩니다.
API 주소·소유자·리포는 도구 페이지 주소에서 자동으로 추정하며, 설정에서 바꿀 수 있습니다.

| 도구 페이지 주소 | API 주소 |
|---|---|
| `https://<owner>.github.io/<repo>/` | `https://api.github.com` |
| `https://pages.<host>/<owner>/<repo>/` | `https://<host>/api/v3` |

## 구조

- `index.html`, `assets/app.js`: 올리기 화면
- `assets/core.js`: GitHub API 호출(문서 + 목록을 커밋 하나로 올림, 동시 업로드 시 재시도)
- `docs/`: 올린 문서. Markdown은 `.md` 원본과 브라우저에서 렌더링하는 `.html` 보기 페이지가 함께 생깁니다.
- `docs/index.json`: 문서 목록
- `.nojekyll`: Jekyll 빌드를 끕니다(Markdown은 브라우저에서 렌더링).

## 주의

- 올린 문서는 링크를 아는 누구나 볼 수 있고, 지워도 git 히스토리에 남습니다.
- 토큰은 각자의 브라우저 저장소에 저장됩니다. 같은 Pages 도메인을 쓰는 다른 사이트의 스크립트가 읽을 수 있으므로,
  공용 기기에서는 "이 기기에 토큰 기억하기"를 끄고, 가능하면 이 용도로만 쓰는 토큰을 만드세요.
