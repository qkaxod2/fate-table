# fate-table

기동형 페이트(Fate Accelerated) 전용 온라인 TRPG 테이블. 특성과 운명점이 화면의 중심이에요.

## 구조

```
apps/web               Next.js 앱 (App Router)
packages/rules-engine  규칙 엔진: 판정, 발동, 피해 흡수, 명령 → 이벤트, 리듀서 (순수 TS)
packages/glossary      용어집: 화면의 모든 용어 표기와 툴팁
docs/                  기획 문서 (아키텍처, 기능, 디자인 시스템, 용어집)
```

설계 기준은 [docs/architecture.md](docs/architecture.md)예요. 클라이언트는 명령을 보내고, 서버가 규칙 엔진으로 검증해 이벤트를 기록하며, 화면 상태는 같은 리듀서로 이벤트를 접어서 계산해요. 주사위는 서버에서만 굴려요.

## 개발

```bash
pnpm install
pnpm dev        # 웹 앱
pnpm test       # 규칙 엔진·용어집 테스트
pnpm typecheck
pnpm lint
```

Node 22, pnpm 10.

## 라이선스 표기

규칙 문구는 Fate Accelerated Edition(Evil Hat Productions, LLC, CC BY 3.0)을 바탕으로 해요.
