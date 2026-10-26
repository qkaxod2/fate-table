# 디자인 시스템 v1 — 기동형 페이트 툴

> 담당: 디자인·UX 스레드. 구현 시 이 문서의 토큰 이름·컴포넌트 이름을 그대로 사용.
> 용어는 /mnt/project-files/plan/glossary.md 기준.

## 0. 확정한 기본값 (열린 질문)
| 질문 | 기본값 | 근거 |
|---|---|---|
| 온라인/오프라인 | 온라인 우선. 테이블 모드(큰 화면 보기 전용)는 P3 | 이벤트 구조상 나중에 추가 비용이 작음 |
| 공개 범위 | 초대 링크 기반 비공개 그룹용. 공개 전환 가능 구조(방별 AI 생성 한도, 이용약관 동의 화면 자리만 확보) | 입문자 일행 우선 |
| 첫 테마 | `paper`(기본, 인덱스 카드) + `fantasy` | 가장 흔한 장르 |

## 1. 비주얼 컨셉: 책상 위의 인덱스 카드
페이트 테이블에서 실제로 측면(특성)을 인덱스 카드에 적어 테이블 가운데 놓는 관습을 그대로 화면으로 옮긴다.
- 바탕은 차분한 회녹색 책상, 특성은 **파란 가로줄 + 빨간 머리줄이 있는 인덱스 카드**에 손글씨체로 적힌다.
- 운명점은 황동색 토큰(동전). 페이트 주사위는 +/−/빈 면이 있는 정사각 타일.
- UI 크롬(버튼·패널)은 조용한 산세리프, 손글씨는 특성 문구에만 쓴다(절제).

## 2. 디자인 토큰 (CSS 변수, `src/styles/tokens.css`)
```css
:root {
  /* surface */
  --desk: #E9EBE6;        --desk-2: #DDE1DA;   /* 바탕, 패널 */
  --card: #FFFEFA;        --card-edge: #D8D6CC;
  --ink: #1F2933;         --ink-2: #52606D;    --ink-3: #8A949E;
  /* index card */
  --rule: #A9C1DC;        --rule-head: #D9786F;
  /* fate */
  --token: #C98A1E;       --token-hi: #F2C46B;  --token-ink: #3A2A08;
  /* outcome (semantic) */
  --fail: #B8443A;  --tie: #56699A;  --success: #2C8559;  --style: #B98A12;
  /* aspect kind edge */
  --k-high: var(--token); --k-trouble: var(--fail); --k-normal: var(--ink-2);
  --k-scene: #2F7F86; --k-consequence: #7A4E9A; --k-boost: var(--ink-3);
  /* type */
  --font-ui: "Pretendard", "IBM Plex Sans KR", system-ui, sans-serif;
  --font-hand: "Gaegu", "Nanum Pen Script", var(--font-ui);
  --font-num: "IBM Plex Mono", ui-monospace, monospace;
  --fs-xs: 12px; --fs-sm: 13px; --fs-md: 15px; --fs-lg: 18px; --fs-xl: 24px; --fs-2xl: 32px;
  /* space / radius / shadow */
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px; --s-6: 32px;
  --r-card: 6px; --r-ctl: 10px; --r-token: 999px;
  --shadow-card: 0 1px 0 var(--card-edge), 0 6px 14px -8px rgb(31 41 51 / .35);
  --dur-fast: 120ms; --dur-dice: 600ms; --dur-token: 700ms; --ease: cubic-bezier(.2,.8,.2,1);
}
[data-theme-mode="dark"] {
  --desk: #15181B; --desk-2: #1C2024; --card: #23272C; --card-edge: #343A41;
  --ink: #E6E8E3; --ink-2: #B4BCC4; --ink-3: #7D8790;
  --rule: #34506E; --rule-head: #A4544C;
  --token: #E0A83A; --token-hi: #F6D48C; --token-ink: #2A1E05;
  --fail: #E06C61; --tie: #8C9CC8; --success: #4FB383; --style: #E2B94A;
  --k-scene: #4FA8AF; --k-consequence: #A880C6;
}
```
- 장르 테마는 `[data-genre="fantasy"]`에서 `--desk`, `--card`, `--rule`, `--font-hand`만 교체(예: 양피지 카드, 갈색 괘선).
- 결과는 색만으로 구분하지 않는다: 아이콘(✕ / = / ✓ / ★)과 문구를 항상 함께.
- 대비 4.5:1 이상, `prefers-reduced-motion` 시 주사위는 즉시 결과, 토큰은 페이드만.

## 3. 레이아웃
- 데스크톱(≥1200): `PartyRail 240px | SceneStage 1fr | StoryLog 340px`, 하단 `ActionBar 72px` 고정. GM은 우측에 `GmDrawer 320px`가 로그 위로 슬라이드.
- 태블릿(768–1199): PartyRail을 상단 가로 띠(아바타+운명점)로 접음, StoryLog는 우측 서랍.
- 모바일(<768): 하단 탭 `내 캐릭터 | 장면 | 로그`, ActionBar는 탭 위 고정. 굴림·발동·강요·피해는 바텀 시트.

## 4. 컴포넌트 목록 (`src/components/`)
| 컴포넌트 | 위치 | 주요 props | 상태/변형 |
|---|---|---|---|
| `AspectCard` | aspect/ | aspect, freeInvokes, canInvoke, canCompel, onInvoke, onCompel | kind별 테두리, hidden(GM만), boost는 점선, 무료 발동 체크 칸 |
| `AspectBoard` | aspect/ | sceneAspects, zoneAspects | 장면 특성 가로 배열, 드롭으로 추가 |
| `FatePointToken` | fate/ | count, size | 개수 표시, 이동 애니(`flyTo`) |
| `FateEconomyBar` | fate/ | players[], gmPool | 상단 미니 그래프 |
| `FateDie` / `DiceTray` | roll/ | faces[-1,0,1]x4, mode('2d'\|'3d') | rolling / settled / reduced-motion |
| `LadderBadge` | roll/ | value | "양호 +3" 형식, 등급표 툴팁 |
| `ActionBar` | roll/ | onRoll | 행동 4버튼 → 접근법 6버튼(등급 표시) → 대상/난이도 → 굴림 |
| `InvokeTray` | roll/ | roll, invokables[], fatePoints | 결과를 바꾸는 카드 강조, +2/다시 굴림, 확정 |
| `OutcomeBanner` | roll/ | action, outcome, shifts | 행동×결과별 문구(아래 6절), 후속 버튼 |
| `OpposedRollPrompt` | roll/ | request | 방어자에게 뜨는 요청 시트, 대기 표시 |
| `CompelOffer` | compel/ | aspect, text, from | 수락(+1)/거절(−1) 카드, GM은 발송 폼 |
| `StressTrack` | sheet/ | boxes[3] | 체크 토글 |
| `ConsequenceSlots` | sheet/ | mild, moderate, severe | 경상2/중상4/중태6, 회복 중 표시 |
| `DamageAbsorber` | conflict/ | incoming, stress, consequences | 조합 제안 칩, 남은 피해 실시간, 탈락/양보 |
| `CharacterSheet` | sheet/ | character, editable | 카드형 시트 |
| `CharacterMini` | party/ | character | 아바타, 운명점, 스트레스, 후유증 점 |
| `PartyRail` | party/ | characters[] | |
| `SceneStage` | scene/ | scene, background | 배경 일러스트, AspectBoard, ZoneBoard |
| `ZoneBoard` | scene/ | zones[], tokens[] | 구역 상자+연결선 (P1) |
| `StoryLog` / `LogEntry` | log/ | events[] | 굴림·발동·강요·채팅·내레이션, 음성 재생 버튼 |
| `CreationWizard` | create/ | draft | 6단계 + 진행 표시 |
| `ApproachAllocator` | create/ | ratings | +3/+2/+2/+1/+1/+0 칩 드래그(키보드로도) |
| `StuntComposer` | create/ | stunt | 문장 템플릿 빈칸 채우기 |
| `PortraitPicker` | media/ | prompt, candidates | NAI 후보 4장, 업로드 |
| `MediaJobToast` | media/ | job | 대기 순번/생성 중/완료 |
| `SfxPanel` | media/ | library[], ambient | GM 서랍 '효과음' 탭: 설명 입력 → ElevenLabs 생성 → 라이브러리 → 재생(모두 동시, `sfx.played`), 장면 앰비언트 루프 켜기/끄기 |
| `SoundSettings` | media/ | volume, sfxOn | 입장 시 '소리 켜기' 1회 바, 개인 볼륨·효과음 끄기(localStorage) |
| `GmDrawer` | gm/ | | 탭: 강요 · NPC · 장면 · 효과음 · 메모 · 이정표 |
| `Glossary` / `Term` | ui/ | term | 용어 툴팁(입문 모드) |
| 기본 UI | ui/ | | Button, IconButton, Sheet(바텀시트), Dialog, Tabs, Toast, Tooltip, Chip |

## 5. 화면 목록 (App Router 경로)
| 경로 | 화면 | 핵심 내용 |
|---|---|---|
| `/` | 랜딩 | "바로 해보기"(샘플 원샷) / 방 만들기 / 방 참가 |
| `/try` | 샘플 원샷 | 샘플 캐릭터 4명 중 선택 → 바로 세션 화면, 단계별 코치마크 |
| `/rooms/new` | 방 만들기 | 캠페인 이름, 테마, AI 사용 여부·한도 |
| `/r/[roomId]/join` | 참가 | 닉네임, 캐릭터 선택/새로 만들기 |
| `/r/[roomId]/create` | 캐릭터 생성 | CreationWizard |
| `/r/[roomId]` | 세션 | 메인 3단 레이아웃 |
| `/r/[roomId]/sheet/[charId]` | 시트 상세 | 모바일 전체 화면 시트 |
| `/r/[roomId]/replay/[sessionId]` | 리플레이 | 공유용 읽기 전용 |

## 6. 결과 안내 문구 (OutcomeBanner)
| 행동 | 실패 | 동점 | 성공 | 대성공 |
|---|---|---|---|---|
| 극복 | 실패했어요. 또는 큰 대가를 치르고 성공할 수 있어요 | 작은 대가를 치르고 성공해요 | 성공! | 대성공! 부스트도 얻어요 |
| 이점 창출 | 특성을 만들지 못했어요(상대가 무료 발동을 얻을 수 있어요) | 부스트를 얻어요 | 특성 + 무료 발동 1 | 특성 + 무료 발동 2 |
| 공격 | 빗나갔어요 | 부스트를 얻어요 | 차이만큼 피해 | 피해, 또는 피해 1을 줄이고 부스트 |
| 방어 | 상대의 행동이 통해요 | 상대가 동점 결과를 얻어요 | 막아냈어요 | 막아내고 부스트를 얻어요 |

## 7. 모션 사양
| 이벤트 | 연출 | 시간 |
|---|---|---|
| 굴림 | 주사위 4개가 순서대로 뒤집힘(80ms 간격) | 600ms |
| 발동 | 카드가 살짝 들리고 +2 배지가 합계로 날아감, 토큰이 플레이어→중앙 | 700ms |
| 강요 수락 | 토큰이 GM→플레이어 | 700ms |
| 대성공 | 합계 숫자에 금색 광택 1회 | 400ms |
| 후유증 | 카드가 슬롯에 꽂힘 | 300ms |

### 7-1. 움직임 어휘 (18절에서 다듬음)
모든 움직임은 `tokens.css`의 같은 곡선과 시간을 써요. 자세한 기준은 18절이에요.

## 8. 접근성·입력
- 단축키: 1–4 행동, Q/W/E/A/S/D 접근법(신중/지략/화려/완력/신속/은밀), Space 굴림, I 발동 트레이, Esc 취소.
- 모든 드래그는 버튼 대안(ApproachAllocator는 선택 후 슬롯 클릭).
- 로그는 `aria-live="polite"`.

---
# v2 보강 (architecture.md v1 리뷰 반영)

## 9. 아키텍처와의 매핑
- 특성 kind → 카드 테두리 토큰: `high→--k-high`, `trouble→--k-trouble`, `normal→--k-normal`, `situation→--k-scene`, `consequence→--k-consequence`, `boost→--k-boost`(점선).
- 테마 속성: `data-theme-mode="light|dark"`(시스템 기본 따름), `data-genre="paper|fantasy"`.
- 연출은 `fx` 큐 항목 하나 = 7절 모션 하나. 도착 3초 지난 이벤트는 연출 생략, `prefers-reduced-motion`이면 모든 fx를 페이드 150ms로 대체.
- 효과음은 fx와 같은 키 이름을 씀: `dice-roll`, `dice-settle`, `token-flip`, `token-fly`, `success`, `style-chime`, `fail-thud`, `compel-card`, `consequence-slot`, `scene-transition`.

## 10. 프레즌스 표시 (PartyRail)
| presence.status | 표시 |
|---|---|
| idle | 없음 |
| choosing | 아바타 아래 "고르는 중…" 점 세 개 |
| rolling | 작은 주사위 아이콘 회전 |
| typing | 로그 하단 "미라가 입력 중" |
오프라인 참가자는 카드 채도 40%로 낮춤.

## 11. 오류 코드 → 사용자 문구 (Toast)
| code | 문구 | 다음 행동 |
|---|---|---|
| NOT_ENOUGH_FATE_POINTS | 운명점이 부족해요. | 무료 발동이 있는 특성을 써 보세요 |
| ASPECT_ALREADY_INVOKED | 이 특성은 이번 굴림에 이미 썼어요. | 다른 특성 카드를 골라 주세요 |
| ROLL_NOT_OPEN | 이미 확정된 굴림이에요. | — |
| FORBIDDEN_ROLE | GM만 할 수 있는 일이에요. | — |
| INVALID_CHARACTER | 캐릭터 시트에 고칠 곳이 있어요. | 해당 단계로 이동 버튼 |
| QUOTA_EXCEEDED | 이번 달 생성 한도를 다 썼어요. | GM이 방 설정에서 늘릴 수 있어요 |
| STALE_STATE | (표시 안 함, 자동 재시도) | — |
| NOT_MEMBER | 이 방의 참가자가 아니에요. | 초대 링크로 다시 들어오기 |

## 12. 되돌리기 (event.undo)
- GM만. 로그 항목에 마우스를 올리면(모바일은 길게 누르기) "되돌리기" 메뉴. 확인은 같은 자리에서 "되돌릴까요? [되돌리기][취소]" 인라인으로.
- 되돌려진 항목은 로그에 취소선 + "GM이 되돌림"으로 남김(삭제하지 않음).

## 13. 빈 상태·첫 실행
| 화면 | 빈 상태 문구 | 행동 |
|---|---|---|
| 장면 특성 없음 | "아직 장면 특성이 없어요. 장면을 한 줄로 묘사해 볼까요?" | GM: 특성 추가 |
| 로그 없음 | "첫 굴림이 여기 기록돼요." | — |
| 캐릭터 없음(참가 직후) | "샘플 캐릭터로 바로 시작하거나 직접 만들 수 있어요." | 샘플 고르기 / 만들기 |
| 소리 꺼짐 | 상단 작은 바 "소리 켜기" (브라우저 자동 재생 정책상 1회 필요) | 소리 켜기 |
| AI 꺼진 방 | 배경 자리에 테마 텍스처 + 장면 이름 | — |

## 14. /try 코치마크 (샘플 원샷 5분 경로)
1. "이 사람이 당신의 캐릭터예요" → 캐릭터 카드 강조
2. "행동을 골라요: 극복" → 행동 바
3. "어떻게 할까요? 접근법을 골라요" → 접근법 버튼
4. "굴려 볼까요?" → 굴리기
5. 실패/동점이면 "특성을 발동하면 +2!" → 발동 트레이, 성공이면 "잘했어요! 다음 장면으로" 
6. GM 역할 NPC(자동)가 강요 1회 제안 → 운명점 거래 체험
각 단계는 건너뛰기 가능, 다시 보기는 도움말 메뉴.

## 15. 랜딩 (/)
- 첫 화면 왼쪽: 제목 "운명점을 주고받는 테이블", 버튼 [바로 해보기] [방 만들기], 초대 코드 입력칸.
- 오른쪽: 인덱스 카드 세 장이 책상 위에 흩어진 정지 화면(핵심 컨셉/약점/장면 특성 예시)과 운명점 토큰.
- 하단: Fate Accelerated(CC BY 3.0, Evil Hat) 기반 표기.

## 16. 음성 정책 변경 (사용자 결정)
- ElevenLabs는 **효과음 전용**. 내레이션 낭독·NPC 목소리(TTS)는 범위에서 제외.
- `narration.posted`는 텍스트 전용: 로그에서 왼쪽 굵은 괘선과 "GM 서술" 라벨로 강조하고 본문은 `--ink-2`.
- 기본 효과음 10종은 빌드 시 생성해 fx와 같은 타이밍에 재생. GM이 만든 효과음은 `sfx.played` 이벤트로 모두에게 동시 재생, 앰비언트 루프는 장면이 끝나면 자동 정지.

## 17. 밤의 무대 v2: 판정 연출 · 주사위 토큰 (2026-10-23)
판정 연출(07)을 밤의 무대 테마에 맞게 다시 잡았어요. 시안은 `plan/screens/index.html`이에요.

- **판정 글자:** Cinzel Decorative 900에 금박 그라데이션을 깔고 판정 색으로 글로우를 넣어요. 기울이지 않고, 흰 외곽선도 쓰지 않아요. PERFECT·GREAT·GOOD·MISS에는 느낌표를 붙이지 않아요.
- **보조 줄:** Noto Serif KR 700으로 "대성공 · 최상 +5"처럼 써요. 양옆에 금색 가는 선을 둬요.
- **띠:** 사선 줄무늬 대신 가로 스포트라이트를 써요. 판정 색 26~34% 그라데이션에 위아래로 금색 1px 선을 둬요.
- **특성:** 스티커 대신 금테 명찰 카드를 써요. 종이 바탕에 Noto Serif KR 700이고, 왼쪽 4px 색 막대로 종류를 구분해요.
  - 핵심: 금
  - 약점: 위험
  - 장면: 비취
  - 후유증: 자수정
  - 부스트: 점선 장밋빛
- **판정 색:** `--perfect #F27BAD`, `--great #6FBCEB`, `--good #5ED1BA`, `--miss #A598DE`. 밝은 쪽은 `--*-hi`예요.
- **글꼴:** 연출용 라틴 글자는 Cinzel / Cinzel Decorative예요. Jua와 M PLUS Rounded는 뺐어요.
- **주사위 토큰:**
  - 내 주사위: `--dice-body #11132A`(밤빛 칠), `--dice-edge #D6B66E`, `--dice-pip #FFE9B0`(금 상감)
  - 상대 주사위: `--dice-body-op #3A1328`(석류빛 칠), `--dice-edge-op #E59AB3`, `--dice-pip-op #FFE0EA`(장밋빛 상감)
  - 3D 모델: 둥근 모서리 큐브(r 0.13), MeshPhysical 클리어코트 0.55, 문양은 금속 맵 + 범프로 상감, 무대 조명 PMREM 환경 반사, ACES 톤매핑, 타원 벨벳 주사위 판, 착지 시 금빛 번짐
  - 테이블: `--dice-table #141629`
  - 3D 재질과 눈 바뀜 모드 모두 이 토큰을 읽어요.
- **주사위 모드:** 자동, 3D(three.js), 눈 바뀜, 없음 중에서 골라요. 3D 품질은 자동, 높음, 중간, 낮음이에요. 구현 기준은 architecture.md 5-2절을 따라요.

## 18. 움직임 다듬기 (2026-10-24)

"딱딱하다"는 피드백을 받고 튜토리얼을 녹화해 프레임 단위로 보며 고쳤어요.

- **곡선 네 가지:** 들어올 때 `--ease-out`(빨리 출발해 천천히 멈춤), 나갈 때 `--ease-in`, 자리 바꿈 `--ease-in-out`, 손에 닿는 것(누름·고름·판정 글자) `--ease-spring`(살짝 튕김).
- **시간:** 누름 90ms, hover 160ms, 들어옴 320ms, 나감 180ms, 장면 560ms. 여러 개가 차례로 들어올 때는 `--stagger` 40ms씩 늦춰요.
- **누름:** 모든 버튼·링크는 `scale`/`translate`로 눌렸다가 튕겨 돌아와요. `transform`과 따로 움직여서 hover로 떠 있는 카드와 부딪히지 않아요. 컴포넌트가 transition을 따로 정하면 목록에 `var(--hover), var(--press)`를 넣어요.
- **굴림:** 패널이 떠오르고 → 주사위가 중력처럼 떨어져 두 번 튀며 착지 때 살짝 눌리고 금빛이 번져요(그림자도 높이를 따라가요) → 합계가 튕기며 찍히고 → 판정 띠가 가운데서 펼쳐진 뒤 글자가 도장처럼 찍혀요(대성공은 광택 1회) → 발동 카드가 하나씩 올라와요. 발동으로 판정이 바뀌면 글자와 합계를 다시 찍어요.
- **스탠딩:** 표정이 바뀌면 앞 그림을 320ms 남겨 두고 겹쳐 바꿔요. 말하는 쪽이 바뀌면 480ms에 걸쳐 밝기와 크기가 바뀌어요.
- **화면·창:** 무대는 배경 → 스탠딩 → 양옆 패널 → 아래 순서로 자리 잡아요. 창은 뒤가 흐려진 다음 떠오르며 열려요.
- **들어오는 애니메이션은 `backwards`로 채워요.** `both`로 두면 끝난 뒤에도 transform이 남아 안쪽 `position: fixed` 창의 기준이 바뀔 수 있어요.
- **`prefers-reduced-motion`:** 위치·크기 움직임은 모두 빼고 짧은 페이드만 남겨요(들어옴 120ms). 주사위는 바로 결과, 번짐·광택은 없어요.
- **발동:** 운명점 토큰(◆)이 내 토큰 줄에서 카드로 날아가 꽂히면 카드가 튕기듯 들리고, +2 배지가 포물선을 그리며 합계로 날아가요(다시 굴리기는 ↻가 주사위로). 다 날아간 뒤에 명령을 보내서 합계가 바뀌는 순간과 착지가 맞아요. 날아가는 동안은 다시 누를 수 없어요(`flyBadge`, `lib/motion.tsx`).
- **운명점:** 강요를 수락하면 ◆가 강요 카드에서 파티 줄의 내 토큰으로 날아가고(7절 "토큰이 GM→플레이어"), 거절하면 내 토큰에서 하나가 카드로 날아가 사라져요. 받을 때 토큰은 튕기며 금빛 고리가 퍼지고, 쓸 때는 빛을 내며 비어요. 수락 버튼은 은은하게 손짓해요.
- **스트레스·후유증:** 스트레스 칸이 차면 도장처럼 찍히고, 후유증·이정표 줄은 옆에서 떠올라요.
- **사라짐:** 창이 스스로 닫히면(×, 바깥 누름, Esc) `useClosing`이 `data-closing`을 붙여 180ms 동안 흐려지며 내려앉은 뒤 닫아요. 조건이 꺼져서 사라지는 것(안내 카드, 강요·피해·방어·이름 짓기 오버레이)은 `<Presence>`가 마지막 모습을 잠깐 남겨 두고 사라지게 해요. 사라지는 동안은 누를 수 없어요(`inert`).
- **GM 대사:** 글자가 한 자씩 적히고(문장 부호 뒤에는 잠깐 쉬어요) 누르면 한 번에 다 나와요. 다 적히면 ▾가 깜빡여요. 배경이 바뀌면 앞 배경이 900ms에 걸쳐 걷혀요.
- **대성공·실패·공격:** 대성공은 띠가 펼쳐진 뒤 불꽃이 사방으로 튀어요. 실패는 글자가 쿵 내려앉아요. 공격이 성공하면 맞은 쪽 스탠딩이 번쩍이며 뒤로 밀려요.
- **카드:** 상황 카드는 마우스 쪽으로 살짝 기울고 종이 광택이 따라와요. 발동을 권할 때는 숨 쉬듯 빛나요.
- **캐릭터 만들기:** 다음 단계는 오른쪽에서, 이전 단계는 왼쪽에서 들어와요. 지금 단계 번호가 톡 튀고, 완성 화면에서는 초상화가 카드처럼 뒤집혀 나오며 시트 줄이 차례로 적혀요. 저장하면 금빛이 한 번 돌아요.
- **구역 지도:** 토큰을 다른 구역으로 옮기면 순간이동하지 않고 포물선을 그리며 날아가 내려앉고, 닿는 순간 작은 소리와 금빛 물결이 퍼져요(FLIP). 고른 토큰은 갈 곳을 기다리며 살짝 떠 있어요.
- **파티·기록·알림:** 파티는 한 사람씩 들어서고 차례가 온 사람은 띠와 얼굴이 한 번 반짝여요. 쓰러지면 천천히 바래요. 새 기록 줄은 종류의 색으로 잠깐 물들고, 기록은 부드럽게 따라 내려가요. 알림은 흐려지며 올라가 사라지고, 되돌리기 알림은 남은 시간을 금줄로 보여 줘요.
- **좁은 화면:** 굴림 결과가 화면 밖에 뜨면 결과 패널로 부드럽게 스크롤해요(`revealOnNarrow`). 위에 붙은 안내 카드 높이만큼 비켜요.

## 19. 가독성 다듬기 (2026-10-26)

"글씨가 작고 흐려서 읽기 힘들다, 보기에 예쁘지 않다"는 피드백을 받고 화면 전체를 다시 손봤어요.

- **글자 크기:** `--fs-xs` 13, `--fs-sm` 14, `--fs-md` 16, `--fs-lg` 19px로 한 단계씩 올렸어요. 본문 줄 간격은 1.65, 제목은 1.3이에요. 11px 이하로 박혀 있던 크기도 올렸어요(키캡·스트레스 칸 글자는 예외).
- **대비:** `--muted`를 `#B6B8C6`로 밝히고, 더 흐린 보조 글자는 `--faint`를 써요. 중립 테두리는 `--line`/`--line-hi`, 금색 `--rule`은 강조할 때만 써요.
- **머리말:** 패널 이름 같은 작은 머리말은 고정폭 글꼴에 자간을 3~6px 벌리던 방식을 버렸어요. 한글은 자간을 벌리면 읽기 힘들어서 `font: var(--label-font)` + `letter-spacing: var(--label-track)`(0.04em)으로 통일해요.
- **영어 라벨을 한국어로:** PARTY · FATE → 파티 · 운명점, ASPECTS ON STAGE → 무대 위 특성, STORY/SYSTEM → 이야기/알림, STEP n / m → n / m, CLEAR → 완료, TUTORIAL → 튜토리얼, SESSION 01 → 세션 1, G M → GM. 판정 글자(PERFECT·GREAT·GOOD·MISS)는 연출이라 그대로 둬요.
- **모양:** 패널·카드·버튼에 둥근 모서리(`--r-card` 10px, `--r-ctl` 10px)와 `--shadow-panel`을 줬어요. 위쪽 바 버튼은 높이 34px 알약 모양으로 맞췄어요. 단축키 숫자(1~4)와 Space는 키캡 모양으로 보여요.
- **비활성 버튼:** 금색을 흐리게 하면 탁해 보여서, 비활성일 때는 `--plate` 바탕에 `--faint` 글자로 바꿔요.
- **오른쪽 열:** 특성 카드는 줄어들지 않고, 남은 높이를 기록이 받아 안에서 스크롤해요(카드 밑으로 기록이 겹쳐 보이던 문제). 기록 탭은 스크롤해도 위에 붙어 있어요.
- **스탠딩:** 그림 아래 끝이 바닥으로 녹아들게 마스크를 줬어요. 기사 그림에 남아 있던 흰 배경을 지웠어요.
- **랜딩:** 주 버튼 하나(튜토리얼) + 설명이 붙은 길 카드 세 개(캐릭터 만들기·방 만들기·초대 코드로 참가) + 작은 링크(내 방 목록·내 그림)로 위계를 나눴어요. 등급표에는 이름과 설명을 붙였어요.
- **한국어 예시 문구:** 한글 이탤릭은 기울기만 흉내 내서 지저분해 보여요. 예시는 기울이지 않고 `--faint` 색으로만 구분해요.
- **조사:** `josa()`는 따옴표·괄호로 감싼 말의 안쪽 마지막 글자로 받침을 판단해요. 동적인 값 뒤에 조사를 직접 붙이지 말고 `josa()`를 써요.
