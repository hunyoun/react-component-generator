# src/AGENTS.md

## Module Context

Vite 기반 React 프론트엔드. 프롬프트 입력(`PromptInput`) → 생성 요청(`useComponentGenerator`) → 결과 카드(`ComponentCard`)에서 미리보기(`LivePreview`)/코드(`CodeView`) 탭으로 보여준다. API 키·프로바이더 선택은 `App.tsx`가 관리한다.

## Tech Stack & Constraints

- 전역 스타일은 `App.css`/`index.css`로만 관리한다(CSS 모듈·styled-components 없음).
- 컴포넌트 미리보기는 `react-live`의 `LiveProvider ... noInline`(`src/components/LivePreview.tsx:14`)으로 렌더링한다. 이 안에서 실행되는 `code`는 `import` 없이 전역 `React`만 쓸 수 있다 — `server/AGENTS.md`의 SYSTEM_PROMPT 제약과 쌍을 이룬다.

## Implementation Patterns

- 데이터 fetch·상태는 커스텀 훅(`useComponentGenerator.ts`)에 모으고, 컴포넌트는 props로만 받는다. 새 서버 연동을 추가할 때 컴포넌트에 직접 `fetch`를 넣지 말고 훅을 확장하라.
- `ComponentCard`는 `previewKey`를 올려 `LivePreview`를 강제로 리마운트시켜 "새로고침"을 구현한다(`src/components/ComponentCard.tsx:17,33,70`). `key` prop 변경 외의 다른 리렌더 트릭을 쓰지 마라.
- 새로고침 후에도 유지해야 하는 상태(API 키, provider, 컴포넌트 목록, 프롬프트 히스토리)는 `useState` 대신 `usePersistedState`(`src/hooks/usePersistedState.ts`)를 쓴다. 저장 키는 `src/utils/storage.ts`의 `STORAGE_KEYS`에 추가하고, `Date`처럼 JSON으로 직렬화되지 않는 필드가 있으면 `reviver` 인자로 복원하라(`useComponentGenerator.ts`의 `reviveComponents` 참고).

## Security Note

- API 키를 `localStorage`에 저장하는 것은 의도된 UX 선택이다(새로고침 후 재입력 방지). 다만 `localStorage`는 같은 오리진의 어떤 스크립트에서도 읽을 수 있어 XSS에 노출되면 키가 함께 유출된다. 서버로 보내는 요청(`/api/generate`) 외의 경로로 `apiKey` 값을 로깅·전송하는 코드를 추가하지 마라.

## Testing Strategy

- `bun run test` (vitest + jsdom, `src/test/setup.ts`).
- `PromptInput.test.tsx`만 존재한다(`@testing-library/react` + `user-event`, 역할 기반 쿼리). `ComponentCard`/`CodeView`/`LivePreview`는 테스트가 없다. `LivePreview`는 `react-live` 내부 렌더링이라 단위 테스트 가치가 낮지만, `ComponentCard`의 상태 전이(`activeTab`, `previewKey`)처럼 순수 로직이 늘어나면 `PromptInput.test.tsx` 패턴을 따라 테스트를 추가하라.

## Local Golden Rules

- `apiKey`는 `App.tsx`의 `usePersistedState` 상태로만 유지하고, 필요한 곳(`handleGenerate`를 통한 `generate` 호출)에만 전달한다. 콘솔 로그나 다른 전역 상태로 복제하지 마라.
- `provider` 변경 시 `apiKey`를 초기화한다(`App.tsx`, `handleProviderChange`). 프로바이더 전환 로직을 바꿀 때도 이 초기화를 유지하라 — 다른 프로바이더의 키가 잘못 전송되는 것을 막는 장치다. (단, `apiKey`도 `provider`도 각각 영속화돼 있으므로, 이 초기화가 저장된 값까지 지우는지 — 즉 전환 직후 새로고침해도 빈 키로 남는지 — 동작이 바뀔 때마다 확인하라.)
