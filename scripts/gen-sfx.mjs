// 기본 효과음을 ElevenLabs로 한 번 만들어 apps/web/public/sfx/ 에 저장한다.
// 실행: ELEVENLABS_API_KEY=... node scripts/gen-sfx.mjs [이름...]   (이미 있는 파일은 건너뛴다, --force로 덮어쓰기)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

export const SFX = {
  'dice-roll': ['four wooden dice rattling and tumbling across a wooden tabletop', 1.4],
  'dice-settle': ['a single wooden die clicking to a stop on a wooden table', 0.6],
  'token-flip': ['a heavy gold coin flipped with a bright metallic ring', 0.8],
  'token-fly': ['a soft magical whoosh ending in a gentle coin chime', 0.9],
  success: ['a short warm harp flourish, positive and gentle', 1.2],
  'style-chime': ['a triumphant sparkling bell chime with shimmering magic, short fanfare', 1.8],
  'fail-thud': ['a low muffled thud on wood with a short descending tone', 0.9],
  'compel-card': ['a playing card slid across a table and flipped over, paper swish', 0.8],
  'consequence-slot': ['a heavy iron latch clanking shut with a dull impact', 0.8],
  'scene-transition': ['a soft page turn followed by a low cinematic whoosh', 1.6],
  'speech-pop': ['a tiny soft paper pop, a speech bubble appearing, very short and subtle', 0.5],
  'hit-slash': ['a quick sword slash whoosh followed by a punchy cinematic impact hit', 0.8],
  'taken-out': ['a heavy body collapsing to the ground with a deep cinematic boom fading out', 1.6],
  'conflict-drum': ['two deep taiko war drum hits, tense and cinematic, short', 1.4],
  'compel-accept': ['a short ominous low string sting with a single coin clink', 1.0],
  'stage-shake': ['a short low rumbling tremor, ground shaking briefly', 0.9],
  // 이벤트에 붙는 작은 소리
  'aspect-place': ['a thick paper card slapped down onto a wooden table, crisp clear paper snap', 0.6],
  'aspect-reveal': ['a paper card flipped over with a soft low magical shimmer underneath, subtle', 1.0],
  heal: ['a soft gentle rising glass tone with a faint cloth rustle, calm and warm', 1.2],
  milestone: ['a warm rising music box arpeggio followed by a soft page turn, gentle triumph', 1.8],
  'turn-bell': ['a single small brass hand bell ding, clear and soft, short', 0.9],
  concede: ['a metal sword dropped onto a stone floor, clear metallic clang and rattle', 1.0],
  sheathe: ['a sword sliding smoothly into a leather scabbard, short', 0.8],
  'pencil-mark': ['a quick pencil check mark scratched on paper, very short', 0.5],
  'paper-tap': ['a very soft dry paper tap, tiny click, extremely short and subtle', 0.5],
  'book-open': ['a leather journal flipped open, crisp paper pages rustling, close up and clear', 0.8],
  // GM이 연출 쪽지에서 모두에게 들려주는 소리
  'cue-thunder': ['a close loud thunder crack rolling into a deep rumble', 2.5],
  'cue-door': ['an old heavy wooden door creaking slowly open', 2.0],
  'cue-knock': ['three firm knocks on a wooden door', 1.2],
  'cue-glass': ['a glass bottle shattering on a stone floor', 1.2],
  'cue-explosion': ['a large distant explosion boom with debris falling', 2.5],
  'cue-howl': ['a lone wolf howling in the distance at night', 3.0],
  'cue-footsteps': ['slow heavy boot footsteps approaching on a wooden floor', 2.5],
  'cue-bell': ['a large church bell tolling once, deep and resonant', 3.0],
  'cue-gasp': ['a small crowd gasping in surprise together', 1.5],
  'cue-clash': ['two steel swords clashing twice with ringing metal', 1.4],
  'cue-gunshot': ['a single pistol gunshot with a short echo', 1.2],
  'cue-phone': ['a modern smartphone ringing with a default ringtone, two rings', 2.5],
};

/** 장면 배경음 (public/amb/). 이어 붙여도 티 나지 않게 loop로 만든다 */
export const AMB = {
  indoor: ['indoor room ambience, a wall clock ticking clearly, air conditioner hum, distant muffled voices', 14],
  cafe: ['cozy cafe ambience, soft murmuring chatter, cups and spoons clinking, no music', 14],
  city: ['distant city traffic ambience, cars passing far away, soft urban hum', 14],
  birds: ['daytime forest ambience, clearly audible birds singing and chirping, leaves rustling in the wind', 14],
  night: ['calm night ambience outdoors, crickets chirping softly, faint breeze', 14],
  tavern: ['medieval tavern ambience, warm crowd murmur, wooden mugs clinking, fire crackling, no music', 14],
  hall: ['large empty stone castle hall ambience, distant echoes, faint wind through high windows', 14],
  dungeon: ['dark stone dungeon ambience, slow water drips echoing, distant low rumble', 14],
  harbor: ['harbor ambience, gentle waves lapping on a wooden dock, distant seagulls, creaking ropes', 14],
  wind: ['steady cold mountain wind blowing across open rocky land, ambience', 14],
  rain: ['steady gentle rain falling outdoors, ambience, no thunder', 14],
  storm: ['heavy rainstorm with strong wind gusts and occasional distant thunder rumble', 16],
  snow: ['cold winter wind howling softly outdoors, snowy blizzard ambience', 14],
  fire: ['a large fire burning and crackling, wood popping, roaring flames ambience', 14],
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
const key = process.env.ELEVENLABS_API_KEY;

const jobs = [
  ...Object.entries(SFX).map(([n, [t, d]]) => ['apps/web/public/sfx', n, t, d, false]),
  ...Object.entries(AMB).map(([n, [t, d]]) => ['apps/web/public/amb', n, t, d, true]),
];
for (const [out, name, text, duration, loop] of jobs) {
  if (only.length && !only.includes(name)) continue;
  mkdirSync(out, { recursive: true });
  const file = `${out}/${name}.mp3`;
  if (existsSync(file) && !force) continue;
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'xi-api-key': key } : {}) },
    body: JSON.stringify({
      text,
      duration_seconds: duration,
      prompt_influence: loop ? 0.4 : 0.6,
      ...(loop ? { loop: true, model_id: 'eleven_text_to_sound_v2' } : {}),
    }),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log('saved', file);
}
// 만든 뒤 ffmpeg로 크기를 맞춘다: 효과음 -18 LUFS, GM 소리 -16 LUFS, 배경음 -24 LUFS(64k). 효과음은 앞의 빈칸을 잘라 낸다.
//   예: ffmpeg -i x.mp3 -af "volume=<목표-측정>dB,alimiter=limit=0.95" -b:a 64k y.mp3
