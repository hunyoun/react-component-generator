# src/AGENTS.md

## Module Context

Vite 기반 React 프론트엔드. 프롬프트 입력(`PromptInput`) → 생성 요청(`useComponentGenerator`) → 결과 카드(`ComponentCard`)에서 미리보기(`LivePreview`)/코드(`CodeView`) 탭으로 보여준다. API 키·프로바이더 선택은 `App.tsx`가 관리한다.

## Tech Stack & Constraints

- 전역 스타일은 `App.css`/`index.css`로만 관리한다(CSS 모듈·styled-components 없음).
- 컴포넌트 미리보기는 `react-live`의 `LiveProvider ... noInline`(`src/components/LivePreview.tsx:14`)으로 렌더링한다. 이 안에서 실행되는 `code`는 `import` 없이 전역 `React`만 쓸 수 있다 — `server/AGENTS.md`의 SYSTEM_PROMPT 제약과 쌍을 이룬다.

## Implementation Patterns

- 데이터 fetch·상태는 커스텀 훅(`useComponentGenerator.ts`)에 모으고, 컴포넌트는 props로만 받는다. 새 서버 연동을 추가할 때 컴포넌트에 직접 `fetch`를 넣지 말고 훅을 확장하라.
- `ComponentCard`는 `previewKey`를 올려 `LivePreview`를 강제로 리마운트시켜 "새로고침"을 구현한다(`src/components/ComponentCard.tsx:17,33,70`). `key` prop 변경 외의 다른 리렌더 트릭을 쓰지 마라.
- API 키(`App.tsx:14`)는 React state에만 둔다. `localStorage`/`sessionStorage`에 저장하지 마라 — 지금 코드베이스 어디에도 그런 영속화가 없다.

## Testing Strategy

- `bun run test` (vitest + jsdom, `src/test/setup.ts`).
- `PromptInput.test.tsx`만 존재한다(`@testing-library/react` + `user-event`, 역할 기반 쿼리). `ComponentCard`/`CodeView`/`LivePreview`는 테스트가 없다. `LivePreview`는 `react-live` 내부 렌더링이라 단위 테스트 가치가 낮지만, `ComponentCard`의 상태 전이(`activeTab`, `previewKey`)처럼 순수 로직이 늘어나면 `PromptInput.test.tsx` 패턴을 따라 테스트를 추가하라.

## Local Golden Rules

- `apiKey`는 `App.tsx` 상태로만 유지하고, 필요한 곳(`handleGenerate`를 통한 `generate` 호출)에만 전달한다. 콘솔 로그나 다른 전역 상태로 복제하지 마라.
- `provider` 변경 시 `apiKey`를 초기화한다(`App.tsx:41-44`, `handleProviderChange`). 프로바이더 전환 로직을 바꿀 때도 이 초기화를 유지하라 — 다른 프로바이더의 키가 잘못 전송되는 것을 막는 장치다.
