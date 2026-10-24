# 무대 그림: 스탠딩 · 표정 · 장면 배경 · NPC 초상화

GM 버튼 줄의 **그림**, 또는 캐릭터 시트 이름 옆 **그림**으로 열어요.

```
한국어 묘사 + 장면/캐릭터 특성 ──media-prompt──▶ Gemini(Vertex AI) ──▶ NAI 태그 (사람이 고칠 수 있음)
태그 + 화풍 프리셋 ──media-image──▶ NovelAI ──▶ Storage(portraits) ──media.attach──▶ 방 상태
```

| 종류              | 크기            | 하는 일                                                                                  |
| ----------------- | --------------- | ---------------------------------------------------------------------------------------- |
| 장면 배경 `scene` | 1216×832        | 사람 없는 풍경. `scene.backgroundUrl`이 화면 배경이 된다                                 |
| 스탠딩 `standing` | 832×1216 → 잘림 | 흰 단색 배경 전신 → 배경을 따서 투명 PNG(`matteBackground`). 원본은 `*.raw.png`로 남긴다 |
| 표정 `expression` | 832×1216 → 잘림 | 원본 스탠딩을 img2img(세기 0.5)로 얼굴 태그만 바꿔 다시 그린다                           |
| 초상화 `npc`      | 832×1216        | 상반신 초상화. 파티 목록·시트에 쓰인다                                                   |

- 무대: 왼쪽은 굴리는 캐릭터(없으면 갈등 차례 → 내 캐릭터), 오른쪽은 굴림 상대(좌우 반전). 말하는 쪽만 밝게.
- 표정: 대사창 위 표정 칩(`character.expression`). 굴림 결과가 나오면 대성공·성공·무승부·실패에 맞는 표정을 잠깐 짓는다.
- LLM 지침: `supabase/functions/media-prompt/guide.ts`. 화풍·품질·작가 태그는 프리셋이 붙이므로 지침은 내용(누가·무엇을·어떤 빛과 구도로)만 다룬다.

## 설정 (GitHub 비밀값 → Supabase 함수 시크릿)

| 이름                          | 종류     | 설명                                                 |
| ----------------------------- | -------- | ---------------------------------------------------- |
| `VERTEX_API_KEY`              | secret   | Vertex AI API 키. 이것 또는 아래 서비스 계정 중 하나 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | secret   | 서비스 계정 키 JSON 전체 (역할: Vertex AI User)      |
| `GOOGLE_CLOUD_PROJECT`        | variable | 서비스 계정 JSON에 project_id가 있으면 생략          |
| `VERTEX_MODEL`                | variable | 기본 `gemini-4-argon`                                |
| `VERTEX_LOCATION`             | variable | 기본 `global`                                        |

하루 사용량: 그림 `MEDIA_DAILY_LIMIT`(기본 60, 종류 합산), 프롬프트 도우미 `PROMPT_DAILY_LIMIT`(기본 120).
