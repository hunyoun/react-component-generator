# AGENTS.md

## Operational Commands

- 패키지 매니저: `bun` 고정. `bun.lock`이 lockfile이다. `npm install`/`yarn install`을 실행하지 마라 — `package-lock.json`이 이미 함께 존재해 추가로 갈라지면 의존성 버전이 어긋난다.
- 설치: `bun install`
- 개발(프론트+API 동시 실행): `bun run dev` (`concurrently`로 `bun run server`와 `vite`를 묶는다, `package.json:7`)
- API 서버만: `bun run server` (`server/index.ts`, 포트 3002 고정)
- 빌드: `bun run build` (`tsc -b && vite build`)
- 테스트: `bun run test` (vitest run, 대상은 `src/**/*.test.{ts,tsx}` + `server/**/*.test.ts`, `vite.config.ts:20`)
- 테스트 watch: `bun run test:watch`
- 린트: `bun run lint`

## Golden Rules

### Immutable

- API 키(`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`)는 `server/index.ts`에서만 다룬다. 클라이언트에는 키 존재 여부(boolean)만 응답한다 — `/api/config`가 `envKeys: { anthropic: !!..., google: !!... }`만 반환한다(`server/index.ts:147-157`). 실제 키 값을 응답 바디·로그·에러 메시지에 포함하지 마라.
- AI가 생성하는 컴포넌트 코드는 `import` 문과 TypeScript 문법(타입 주석·interface·generic)을 쓸 수 없고, 끝에 `render(<Component />)` 호출이 있어야 한다. `src/components/LivePreview.tsx:14`의 `<LiveProvider code={code} noInline>`가 이 제약을 강제하는 런타임이고, `server/index.ts:9-20` SYSTEM_PROMPT가 같은 제약을 모델에게 지시한다. 둘 중 하나만 고치면 렌더링이 깨진다.

### Do's & Don'ts

- LLM 응답은 지시를 어길 수 있다고 가정하고 후처리로 검증하라. SYSTEM_PROMPT가 이미 "마크다운 펜스 금지"·"render 호출 필수"를 지시하는데도(`server/index.ts:16,19`), `generator.ts`의 `stripCodeFences`/`ensureRenderCall`이 결과를 다시 검증·보정한다(`server/generator.ts:4-24`). 이 후처리를 "SYSTEM_PROMPT가 이미 말했으니 중복"이라며 제거하지 마라.
- `callGoogle`(`server/index.ts:134-136`)만 `withModelFallback`으로 여러 모델을 순차 시도한다(`GOOGLE_MODELS`, `server/index.ts:5`). `callAnthropic`(`server/index.ts:68-96`)은 단일 모델 고정이다. 한쪽의 폴백 정책을 바꿀 때는 이 비대칭이 의도된 것인지 먼저 확인하고, 맞추려면 양쪽에 함께 반영하라.
- 부수효과가 있는 코드(`server/index.ts`의 `Bun.serve` 핸들러)는 테스트가 없다. 순수 함수(`server/generator.ts`, `server/fallback.ts`)는 전부 테스트가 있다(`generator.test.ts`, `fallback.test.ts`) — `generator.ts:1-2` 주석이 "부수효과가 없어 단위 테스트가 가능하다"고 이유를 명시한다. 새 로직은 가능한 한 순수 함수로 분리하고 테스트를 함께 작성하라.

## Project Context

AI 프롬프트로 React 컴포넌트를 즉시 생성해 실시간 미리보기와 코드를 제공하는 도구다.

Tech Stack: React 19, TypeScript, Vite, Bun(API 서버), react-live, Anthropic Claude / Google Gemini(멀티 프로바이더), Vitest.

## Standards & References

- 코딩 컨벤션: `eslint.config.js` (`js.configs.recommended` + `typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh`).
- 커밋 메시지: `.claude/skills/commit/SKILL.md`의 `<type>: <한 줄 요약>` 형식(한국어)을 따른다.
- 이 파일과 코드가 어긋나면(테스트 경계가 바뀌거나 프로바이더 폴백 정책이 통일되는 등) 업데이트를 제안하라.

## Context Map

- **[server/ 수정 (API·프로바이더)](./server/AGENTS.md)** — API 키 처리, 프로바이더 폴백, SYSTEM_PROMPT 수정 시.
- **[src/ 수정 (UI·react-live)](./src/AGENTS.md)** — 컴포넌트·훅 작업, 미리보기 렌더링 수정 시.
- **[hiring-lab/ 작업 (이력서 검토 실습)](./hiring-lab/AGENTS.md)** — 본 앱과 무관한 채용 실습 자료를 다룰 때.
