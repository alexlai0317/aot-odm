// 全部的可調參數集中在這裡。世界尺度：1 unit = 1 公尺，速度單位 m/s。
// 想調手感（飛得快不快、鉤索黏不黏）改這裡就好，不用動邏輯。

// ── 玩家本體 ──────────────────────────────────────────────
export const EYE_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.6;
export const PLAYER_MAX_HP = 100;

// 回血：脫離接觸才會啟動。設計上是要獎勵「打不過就先撤」，
// 而不是讓玩家站在原地等血回滿，所以附近有泰坦就完全不回。
export const HP_REGEN_DELAY = 5; // 最後一次受傷後要撐過幾秒才開始回
export const HP_REGEN_RATE = 4.5; // 每秒回復量
export const HP_REGEN_SAFE_DISTANCE = 40; // 這個距離內有活著的泰坦就中斷回血
export const GRAVITY = 22;
export const AIR_DRAG = 0.19; // 每秒速度衰減比例（沒有這個會越盪越快）
export const MAX_SPEED = 58; // 硬上限，換算約 209 km/h，瓦斯全開也不會噴到誇張的距離
export const BRAKE_DRAG = 3.6; // 按住煞車時的速度衰減（每秒），大約 0.2 秒砍半
export const LANDING_FRICTION = 9; // 落地後的地面摩擦，讓人停得住而不是滑出屋頂

// 落地衝擊。門檻刻意設在很高的垂直速度：正常盪來盪去、掃過屋頂都不該扣血，
// 只有真的直直往下砸才算數。上限則保證摔一次不會直接死。
export const FALL_DAMAGE_SPEED = 46; // 低於這個垂直速度完全不受傷（約 166 km/h）
export const FALL_DAMAGE_SCALE = 1.6; // 超出門檻後每 1 m/s 的傷害
export const FALL_DAMAGE_MAX = 38; // 單次落地的傷害上限
export const FALL_DAMAGE_BRAKE_RELIEF = 0.4; // 落地瞬間按著煞車能減免的比例

export const GROUND_MOVE_SPEED = 7.5;
export const GROUND_ACCEL = 46;
export const AIR_CONTROL_ACCEL = 11; // 空中用 WASD 微調的力道，刻意做得比地面小
export const JUMP_SPEED = 8;

// ── 鋼索機動裝置 ──────────────────────────────────────────
export const HOOK_RANGE = 135;
export const HOOK_TRAVEL_SPEED = 340; // 鉤爪飛出去的速度，純視覺（射中判定在發射當下就算好）
export const HOOK_PULL_ACCEL = 54; // 沿繩索方向的拉力加速度（要明顯大於重力才爬得上去）
// 拉力會隨速度遞減，到這個速度就完全不再加速。
// 用遞減而不是硬性上限：起步時照樣有力，但不會盪一盪就飆到失控
export const HOOK_PULL_FALLOFF = 52;
export const HOOK_REEL_RATE = 7; // 繩索自然收短的速度
export const HOOK_REEL_BOOST = 32; // 按住瓦斯時額外的收繩速度
export const HOOK_MIN_LENGTH = 4; // 收到這麼近就自動脫鉤，避免整個人黏在牆上
// 繩索故意做成「很硬的彈簧」而不是完全剛體：剛體約束在高速下會把人瞬間拉停，
// 彈簧 + 阻尼則會畫出圓弧，這才是盪起來的手感
export const ROPE_SPRING = 30; // 繩索被拉長時的回彈力（每公尺）
export const ROPE_DAMP = 15; // 削掉離心方向速度的比例（每秒）

// ── 瓦斯 ─────────────────────────────────────────────────
export const GAS_MAX = 100;
export const GAS_THRUST = 58; // 噴射推力（沿視線方向）
export const GAS_BURN_RATE = 17; // 噴射時每秒消耗
export const GAS_HOOK_BURN = 2.5; // 掛著鉤索時每秒的基礎消耗（捲揚機也吃瓦斯）
export const GAS_REFILL_RATE = 40; // 雙腳著地時的補充速度
export const GAS_REFILL_DELAY = 0.6; // 落地後多久才開始補（避免踩一下就回滿）

// ── 刀刃 ─────────────────────────────────────────────────
export const BLADE_MAX_DURABILITY = 100;
export const BLADE_SPARE_PAIRS = 5; // 備用刀刃組數
export const BLADE_RELOAD_TIME = 1.1;
export const BLADE_SWING_TIME = 0.34; // 一次揮擊的總時長
export const BLADE_HIT_WINDOW = [0.06, 0.2]; // 揮擊過程中真正有判定的時間區段
export const BLADE_REACH = 7.5;
export const BODY_REACH_SCALE = 0.5; // 砍到肉體的判定範圍刻意比弱點小，免得擦邊就吃掉一次揮擊
export const BLADE_COST_NAPE = 16; // 命中弱點的耐久消耗
export const BLADE_COST_BODY = 38; // 砍到肉體其他部位很傷刀

export const MIN_KILL_SPEED = 8.4; // 低於這個速度砍下去只會彈開（約 30 km/h）
export const BLADE_BASE_DAMAGE = 12;
export const BLADE_SPEED_DAMAGE = 3.4; // 每 1 m/s 換算的傷害

// ── 泰坦 ─────────────────────────────────────────────────
// height 是身高（公尺），napeHp 是後頸弱點的耐久，speed 是行走速度。
// 身高分三個級距，都拿房子當量尺（world.js 裡一般街廓房子的基礎高度約 18m，
// 離市中心越近會再疊加到 40 多公尺，城牆頂是 52m）：
//   HOUSE_HEIGHT / 2 → 半個房子高（小型）
//   HOUSE_HEIGHT     → 跟房子差不多高（一般、異常型——異常型靠速度跟走位區分，不是體型）
//   BIG_HEIGHT       → 現在這種、比房子更高一截的大型泰坦（維持原本壓在天際線下的設定）
const HOUSE_HEIGHT = 18;
const BIG_HEIGHT = 25;

export const TITAN_TYPES = {
  small: { label: '小型', height: HOUSE_HEIGHT / 2, napeHp: 55, speed: 9.5, damage: 18, color: 0xd9a689 },
  normal: { label: '一般', height: HOUSE_HEIGHT, napeHp: 100, speed: 6.5, damage: 28, color: 0xcf9c7d },
  large: { label: '大型', height: BIG_HEIGHT, napeHp: 165, speed: 5, damage: 42, color: 0xc08e6f },
  abnormal: { label: '異常型', height: HOUSE_HEIGHT, napeHp: 120, speed: 13, damage: 34, color: 0xb87f6a },
};

export const TITAN_ATTACK_COOLDOWN = 1.6;
export const TITAN_STAGGER_TIME = 1.8; // 砍斷手腳後的硬直
export const TITAN_LIMB_HP = 45; // 手腳的耐久，砍掉會硬直
export const TITAN_WIND_TIME = 0.6; // 攻擊前的蓄力時間，雙臂後拉＋上半身前撲，是明顯的攻擊前兆
export const TITAN_BODY_RADIUS_SCALE = 0.22; // 身體碰撞半徑＝身高 × 這個比例，撞建築物/撞彼此都用這個

// ── 頭目泰坦（boss）───────────────────────────────────────
// 九隻原創的頭目泰坦，全都比「大型」泰坦（25m）明顯更高、後頸耐久也拉到需要
// 好幾次揮擊才砍得完，每隻各給一個獨立招式（實作在 bossTitan.js）。
// 順序即出場順序：波次到了 BOSS_WAVE_INTERVAL 的倍數，照這個順序輪流出一隻。
export const BOSS_TITAN_TYPES = {
  swiftShadow: {
    label: '疾影泰坦', height: 14, napeHp: 260, speed: 15, damage: 30, color: 0xa9714f,
    ability: 'frenzy', attackCooldownMult: 0.45, turnRate: 3.0, // 移動快、攻擊冷卻短，純粹靠速度纏鬥
  },
  nomad: {
    label: '遊獵泰坦', height: 16, napeHp: 240, speed: 14, damage: 20, color: 0x8a8267,
    ability: 'evade', fleeDistance: 26, // 玩家靠太近就轉身逃跑，逼玩家用鉤索才追得上
  },
  heavyArmor: {
    label: '重甲泰坦', height: 30, napeHp: 520, speed: 5.5, damage: 46, color: 0x9a9a9e,
    ability: 'charge', chargeSpeed: 34, chargeWindup: 0.9, chargeDuration: 1.1, chargeCooldown: 5,
  },
  stonethrow: {
    label: '投石泰坦', height: 27, napeHp: 460, speed: 6, damage: 32, color: 0x7a6248,
    ability: 'throw', throwCooldown: 3.5, throwSpeed: 46, throwDamage: 24, throwRadius: 6,
  },
  scorching: {
    label: '灼焰泰坦', height: 48, napeHp: 700, speed: 3.2, damage: 55, color: 0xd8c8b0,
    ability: 'steam', steamCooldown: 6, steamRadius: 22, steamDamage: 22, steamWarning: 1.2, turnRate: 0.9,
  },
  hardshell: {
    label: '硬殼泰坦', height: 22, napeHp: 380, speed: 9, damage: 30, color: 0xcaa788,
    ability: 'harden', hardenCooldown: 8, hardenDuration: 3, hardenReduction: 0.85,
  },
  spike: {
    label: '尖刺泰坦', height: 24, napeHp: 420, speed: 6.5, damage: 34, color: 0x6f6a7a,
    ability: 'spike', spikeCooldown: 4.5, spikeWarning: 1.1, spikeDamage: 30, spikeRadius: 7,
  },
  rampage: {
    label: '狂暴泰坦', height: 20, napeHp: 360, speed: 8, damage: 26, color: 0xb6503f,
    ability: 'enrage', enrageThreshold: 0.5, enrageSpeedMult: 1.5, enrageDamageMult: 1.4,
  },
  command: {
    label: '號令泰坦', height: 34, napeHp: 620, speed: 7, damage: 38, color: 0xe4ded0,
    ability: 'rally', rallyCooldown: 10, rallyHeal: 40, rallySpeedMult: 1.3, rallyDuration: 4,
  },
};
export const BOSS_ORDER = [
  'swiftShadow', 'nomad', 'heavyArmor', 'stonethrow', 'scorching', 'hardshell', 'spike', 'rampage', 'command',
];
export const BOSS_WAVE_INTERVAL = 5; // 每 N 波出一隻頭目泰坦（第 5、10、15...波），跑完九隻會重複並加成
export const BOSS_REPEAT_SCALE = 0.2; // 每重複一輪，napeHp / damage 再往上加這個比例
export const BOSS_ESCORT_SCALE = 0.5; // 頭目波的雜兵數量打這個折扣，不會同時應付太多東西

// ── 玩家變身泰坦（限時終極技）──────────────────────────────
// 累積量表由揮刀命中泰坦來加，滿了按 T 觸發。變身中完全免疫傷害、
// 不能用鋼索／瓦斯／刀刃，只能靠拳腳近戰，時間到自動變回人類。
export const TITAN_FORM_GAUGE_MAX = 100;
export const TITAN_FORM_GAUGE_PER_NAPE_HIT = 14; // 命中弱點時的量表增幅
export const TITAN_FORM_GAUGE_PER_BODY_HIT = 5; // 命中肉體的量表增幅
export const TITAN_FORM_GAUGE_PER_KILL = 20; // 擊殺再額外加成
export const TITAN_FORM_DURATION = 16; // 變身持續秒數
export const TITAN_FORM_HEIGHT = 15; // 玩家泰坦化後的身高
export const TITAN_FORM_EYE_RATIO = 0.92; // 視線高度＝身高 × 這個比例
export const TITAN_FORM_MOVE_SPEED = 11; // 地面移動速度（比人類慢很多但比一般泰坦快）
export const TITAN_FORM_TURN_SPEED = 3.2; // 每秒最大轉向弧度，避免瞬間轉身太不自然
export const TITAN_FORM_PUNCH_DAMAGE = 260; // 一拳的傷害，足以幾拳打死一般泰坦
export const TITAN_FORM_PUNCH_REACH = 9;
export const TITAN_FORM_PUNCH_TIME = 0.55; // 一次揮拳的總時長
export const TITAN_FORM_PUNCH_HIT_WINDOW = [0.15, 0.32]; // 揮拳過程中真正有判定的時間區段
export const TITAN_FORM_PUNCH_COOLDOWN = 0.35; // 兩拳之間的最短間隔

// 踢擊：滑鼠右鍵，reach 比拳頭遠、傷害略低，跟拳頭形成「近戰用拳、稍遠用腳」的節奏差異
export const TITAN_FORM_KICK_DAMAGE = 200;
export const TITAN_FORM_KICK_REACH = 12;
export const TITAN_FORM_KICK_TIME = 0.5;
export const TITAN_FORM_KICK_HIT_WINDOW = [0.18, 0.34];
export const TITAN_FORM_KICK_COOLDOWN = 0.45;

// 變身瞬間的視覺特效：一圈小閃電＋一次大爆炸衝擊波
export const TITAN_TRANSFORM_EXPLOSION_RADIUS = 12;
export const TITAN_TRANSFORM_EXPLOSION_DURATION = 0.7;
export const TITAN_TRANSFORM_LIGHTNING_COUNT = 10;

// ── 關卡 ─────────────────────────────────────────────────
export const WAVE_BREAK_TIME = 8; // 波次之間的喘息時間（也是主要的回血窗口）
export const WAVE_BASE_COUNT = 3; // 第 1 波的泰坦數
export const WAVE_GROWTH = 1.6; // 每波增加的數量

// ── 城區 ─────────────────────────────────────────────────
export const CITY_RADIUS = 300; // 城牆內半徑
export const WALL_HEIGHT = 52;
export const BLOCK_SIZE = 34; // 一個街廓的邊長（縮小過，房子改小一號、街道更密）
export const STREET_WIDTH = 12;
export const ROOF_PITCH_RATIO = 0.62; // 屋脊高度 = 屋頂跨距 × 這個比例，數字越大屋頂越陡
