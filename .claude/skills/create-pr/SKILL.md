---
name: create-pr
description: |
  현재 브랜치의 커밋을 베이스 브랜치와 비교 분석해 PR 제목과 본문을 작성하고, 필요하면 push한 뒤 `gh pr create`로 PR을 연다.
  이 프로젝트(react-component-generator) 자신에서 실행되면 한국어 PR 템플릿을, 그 외 모든 저장소에서는 영문 템플릿을 자동으로 고른다.
  "PR 만들어줘", "PR 올려줘", "pull request 만들어줘", "이 브랜치 리뷰 요청해줘", "/create-pr" 같은 요청에 활성화한다.
  변경사항을 아직 커밋하지 않았거나 현재 브랜치가 베이스 브랜치(main/master 등) 자체라면 이 스킬을 실행하지 않고 먼저 정리하도록 안내한다.
argument-hint: "[en|ko]"
context: fork
allowed-tools: Read Glob Grep Bash
---

# create-pr: 브랜치 분석 후 PR 생성

현재 브랜치와 베이스 브랜치의 차이를 분석해 PR 제목·본문을 작성하고 `gh pr create`로 PR을 생성한다. diff·로그를 읽는 과정에서 나오는 대량 출력은 포크된 컨텍스트 안에서만 쓰이고 메인 대화로 넘어오지 않는다.

PR 본문은 `references/pr-template.ko.md`(한국어)와 `references/pr-template.en.md`(영문) 두 가지가 있다. 이 저장소(`react-component-generator`) 자신에서 작업할 때는 한국어를, 그 외 모든 저장소(다른 프로젝트에 복사돼 쓰일 때)에서는 영문을 쓴다(Step 2).

## 워크플로우

### Step 0: 사전 점검

- `gh auth status`로 GitHub CLI 인증을 확인한다. 로그인돼 있지 않으면 `gh auth login` 안내 후 중단한다.
- `git branch --show-current`로 현재 브랜치를 확인한다. 베이스 브랜치(`git symbolic-ref refs/remotes/origin/HEAD` 또는 `main`/`master`)와 같으면 PR을 만들 수 없다. 사용자에게 알리고 중단한다 — 이 스킬은 브랜치를 새로 만들지 않는다.
- `git status`로 미커밋 변경이 있는지 확인한다. 있으면 PR 본문이 실제 커밋과 어긋날 수 있으므로, 먼저 커밋(`commit` 스킬 등)하도록 안내하고 중단한다.

### Step 1: 베이스 브랜치·원격 상태 확인

- 베이스 브랜치를 확정한다(원격 기본 브랜치 우선, 없으면 `main`/`master` 순으로 확인).
- 현재 브랜치가 원격에 push돼 있는지 확인한다(`git rev-parse --abbrev-ref --symbolic-full-name @{u}` 실패 시 미push). 안 돼 있으면 `git push -u origin <브랜치>`로 push한다. force push는 쓰지 않는다.
- 이 브랜치로 이미 열린 PR이 있는지 확인한다(`gh pr view --json url,state`). 있으면 새로 만들지 않고 기존 URL을 보여주고 종료한다.

### Step 2: PR 템플릿 언어 판단

`$ARGUMENTS`에 `en` 또는 `ko`가 명시돼 있으면 그것을 그대로 따르고 이 단계의 나머지는 건너뛴다.

명시가 없으면 **이 저장소 자신인지 여부**로만 판단한다:

- `git remote get-url origin`(없으면 `git rev-parse --show-toplevel`의 디렉터리 이름)에 `react-component-generator`가 포함되면 **이 프로젝트 자신**이다 → 한국어 템플릿(`pr-template.ko.md`).
- 그 외 **모든 저장소**(이 스킬이 다른 프로젝트에 복사돼 실행되는 경우)는 → 영문 템플릿(`pr-template.en.md`).

저장소별 커밋 언어나 README 언어 등 다른 신호는 보지 않는다 — "이 프로젝트인가, 아닌가"만이 유일한 기준이다.

### Step 3: 변경사항 분석

- `git log <base>..HEAD --oneline`으로 이번 PR에 포함될 커밋 전체를 확인한다.
- `git diff <base>...HEAD`로 실제 변경 내용을 확인한다. 파일명이나 커밋 메시지만으로 추측하지 말고, 필요하면 Read/Grep으로 변경된 파일의 맥락을 추가로 읽는다.
- diff에 `.env`, 키·토큰처럼 보이는 값이 있으면 PR 본문에 그 값을 그대로 옮기지 않는다. 존재한다는 사실만 언급한다.

### Step 4: PR 제목·본문 작성

- 제목: 커밋이 하나면 그 커밋 메시지를 그대로, 여러 개면 전체를 아우르는 한 줄 요약을 짓는다. 저장소의 커밋 컨벤션(언어, `<type>: <요약>` 형식 등)이 있으면 그 스타일을 따르고, 특별한 컨벤션이 없으면 Step 2에서 고른 템플릿과 같은 언어로 제목을 쓴다.
- 본문: Step 2에서 고른 템플릿(`references/pr-template.ko.md` 또는 `references/pr-template.en.md`)을 Read로 읽고 그 구조를 그대로 따라 채운다. 플레이스홀더(`<...>`)는 전부 실제 분석 내용으로 교체하거나, 해당 사항이 없는 섹션(예: 관련 이슈 없음)은 템플릿 지시대로 생략한다. 두 템플릿을 섞어 쓰지 않는다.
- Test plan은 실제로 실행했거나 레포에서 확인 가능한 검증 수단(테스트·린트·수동 확인)만 적는다. 하지 않은 검증을 체크된 것처럼 적지 않는다.

### Step 5: PR 생성

- `allowed-tools`에 Write가 없으므로, 본문은 Bash heredoc으로 임시 파일에 적어 전달한다:
  ```bash
  cat > /tmp/pr-body-$$.md <<'EOF'
  <Step 4에서 작성한 본문>
  EOF
  gh pr create --base <base> --title "<제목>" --body-file /tmp/pr-body-$$.md
  rm -f /tmp/pr-body-$$.md
  ```
- 사용자가 draft로 명시하면 `--draft`를 추가한다. 별다른 말이 없으면 일반 PR로 만든다.

### Step 6: 결과 보고

- 생성된 PR URL을 사용자에게 전달한다.
- push 여부, 베이스 브랜치, 포함된 커밋 수를 간단히 요약한다.

## 주의사항

- 베이스 브랜치(main/master 등) 위에서는 실행하지 않는다.
- 미커밋 변경이 있으면 PR을 만들지 않고 먼저 커밋하도록 안내한다.
- 이미 해당 브랜치의 PR이 있으면 중복 생성하지 않고 기존 PR을 보여준다.
- force push, `--no-verify`, 베이스 브랜치 직접 push 등 되돌리기 어려운 작업은 하지 않는다.
- PR 본문에는 diff에서 확인한 사실만 쓴다. 확인하지 않은 테스트 결과나 영향 범위를 추측해 단정하지 않는다.
