// 배포된 사이트에서 두 브라우저(GM, 플레이어)로 방 하나를 끝까지 돌려 본다.
// 실행: BASE_URL=https://qkaxod2.github.io/fate-table node scripts/e2e/room.mjs
import { chromium } from 'playwright';

const BASE = (process.env.BASE_URL ?? '').replace(/\/$/, '');
const T = 20_000;
const note = (m) => console.log(`::notice::${m}`);

const browser = await chromium.launch();
const errors = [];
async function open(label, init) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${label}: ${m.text()}`));
  return page;
}

try {
  // 1. GM이 방을 만든다
  const gm = await open('gm');
  await gm.goto(`${BASE}/rooms/new/`);
  await gm.getByPlaceholder('예: 금요일 밤의 모험').fill('E2E 테스트 방');
  await gm.locator('input').nth(1).fill('지엠');
  await gm.getByRole('button', { name: '방 만들기' }).click();
  await gm.waitForURL(/\/room\/\?id=/, { timeout: T });
  const invite = await gm.getByRole('button', { name: /^초대 / }).textContent({ timeout: T });
  const code = invite.replace('초대', '').trim();
  note(`room created, code=${code}`);

  // 2. 장면 시작
  await gm.getByPlaceholder('장면 이름 (예: 불타는 곡물 창고)').fill('안개 낀 부두');
  await gm.getByPlaceholder(/장면 특성 1/).fill('미끄러운 갑판');
  await gm.getByRole('button', { name: '장면 시작' }).click();
  await gm.getByRole('heading', { name: '안개 낀 부두' }).waitFor({ timeout: T });
  note('scene started');

  // 3. 플레이어가 저장해 둔 캐릭터로 참가
  const draft = {
    key: 'e2e',
    name: '세라',
    isNpc: false,
    approaches: { careful: 3, clever: 2, flashy: 2, forceful: 1, quick: 1, sneaky: 0 },
    stunts: [],
    highConcept: '별을 읽는 떠돌이 점술사',
    trouble: '예언을 외면하지 못한다',
    aspects: [],
    savedAt: new Date().toISOString(),
  };
  const pl = await open(
    'player',
    `localStorage.setItem('fate.myCharacters', ${JSON.stringify(JSON.stringify([draft]))})`,
  );
  await pl.goto(`${BASE}/join/?code=${code}`);
  await pl.locator('input').nth(1).fill('플레이어');
  await pl.getByRole('button', { name: '들어가기' }).click();
  await pl.waitForURL(/\/room\/\?id=/, { timeout: T });
  await pl.getByRole('button', { name: /세라/ }).click();
  await pl.locator('aside').getByText('세라').waitFor({ timeout: T });
  await gm.locator('aside').getByText('세라').waitFor({ timeout: T });
  note('player joined and brought a character; GM saw it live');

  // 4. 플레이어 극복 굴림 → 확정, GM 화면에 결과 기록
  await pl.locator('h1').click();
  await pl.keyboard.press('1');
  await pl.keyboard.press('q');
  await pl.keyboard.press('Space');
  await pl.getByRole('button', { name: '이대로 확정' }).click({ timeout: T });
  await gm
    .getByText(/결과: /)
    .first()
    .waitFor({ timeout: T });
  note('player rolled and finalized; GM log updated');

  // 5. GM이 NPC를 만들어 플레이어를 공격 → 플레이어가 방어
  await gm.getByText('NPC 만들기').click();
  await gm.getByPlaceholder('이름').fill('밀수꾼');
  await gm.getByPlaceholder('핵심 컨셉').fill('부두의 칼잡이');
  await gm.getByRole('button', { name: '만들기' }).click();
  await gm.locator('aside').getByText('밀수꾼').waitFor({ timeout: T });
  await gm.keyboard.press('3');
  await gm
    .locator('select')
    .filter({ has: gm.locator('option', { hasText: '고르기' }) })
    .selectOption({ label: '세라' });
  await gm.locator('h1').click();
  await gm.keyboard.press('a');
  await gm.keyboard.press('Space');
  await pl.getByRole('button', { name: /^신속/ }).click({ timeout: T });
  await gm
    .getByText(/두 결과 공개/)
    .first()
    .waitFor({ timeout: T });
  note('opposed roll: player defended, both revealed');

  if (errors.length) {
    for (const e of errors) console.log(`::warning::${e}`);
  }
  note('room e2e passed');
} catch (e) {
  for (const x of errors) console.log(`::warning::${x}`);
  console.log(`::error::room e2e failed: ${e.message.split('\n')[0]}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
