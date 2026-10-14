# server/AGENTS.md

## Module Context

Bun(`Bun.serve`)으로 돌아가는 단일 파일 API 프록시 서버. 프론트엔드의 `/api/generate`, `/api/config` 요청을 받아 Anthropic/Google 모델을 호출하고 결과를 react-live가 실행할 수 있는 코드로 정규화한다. `vite.config.ts:9-14`의 `/api` 프록시로 프론트엔드와 연결된다.

## Tech Stack & Constraints

- `Bun.serve`만 쓴다. Express 등 별도 HTTP 프레임워크를 추가하지 않는다(`server/index.ts:138`).
- 외부 호출은 `fetch`만 사용한다(`callAnthropic`/`callGoogleModel`). axios 등 추가 HTTP 클라이언트는 불필요하다.
- 포트 3002 고정(`server/index.ts:139`). 바꾸면 `vite.config.ts:11`의 프록시 대상도 함께 바꿔야 한다.

## Implementation Patterns

- 부수효과 없는 로직(텍스트 정규화, 폴백 시도)은 `generator.ts`/`fallback.ts`에 함수로 분리하고, `index.ts`는 라우팅·fetch·에러 응답만 담당한다.
- 프로바이더별 호출 함수(`callAnthropic`, `callGoogleModel`)는 "요청 조립 → fetch → 에러 체크 → 텍스트 추출" 순서를 따른다. 새 프로바이더를 추가할 때 같은 순서를 따르라.
- 에러는 상태 코드 문자열 포함 여부로 분기한다(`message.includes('503')`, `message.includes('429')`, `server/index.ts:194-206`). 새 에러 유형도 같은 패턴으로 분기하라.

## Testing Strategy

- `bun run test` (vitest). `generator.test.ts`/`fallback.test.ts`가 순수 함수 전체를 커버한다.
- `index.ts`의 라우팅·fetch 로직은 테스트가 없다. 로직을 추가할 때 가능하면 순수 함수로 뽑아 테스트를 붙이고, `index.ts`에는 호출만 남겨라.

## Local Golden Rules

- `/api/config`(`server/index.ts:147-157`)는 `envKeys` boolean만 반환한다. 실제 키 값이나 `process.env` 전체를 노출하는 필드를 추가하지 마라.
- `SYSTEM_PROMPT`(`server/index.ts:7-49`)를 고칠 때 "import 금지"·"TypeScript 금지"·"render 호출 필수" 세 규칙은 반드시 유지하라. `src/components/LivePreview.tsx`의 `noInline` 렌더링이 이 규칙에 의존한다.
- `stripCodeFences`/`ensureRenderCall`(`generator.ts`)을 단순화하거나 제거하지 마라. SYSTEM_PROMPT 지시와 중복돼 보여도, LLM이 지시를 어겼을 때의 방어선이다.
- `callGoogle`만 `GOOGLE_MODELS`(`server/index.ts:5`) 목록으로 폴백한다. `callAnthropic`에 폴백을 추가하려면 모델 목록과 실패 기준을 먼저 정의하라(현재는 근거가 없다).
