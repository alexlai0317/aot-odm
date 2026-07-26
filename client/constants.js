// 全部的可調參數集中在這裡。世界尺度：1 unit = 1 公尺，速度單位 m/s。
// 想調手感（飛得快不快、鉤索黏不黏）改這裡就好，不用動邏輯。

// ── 玩家本體 ──────────────────────────────────────────────
export const EYE_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.6;
export const PLAYER_MAX_HP = 100;

// 回血：脫離接觸才會啟動。設計上是要獎勵「打不過就先撤」，
// 而不是讓玩家站在原地等血回滿，所以附近有巨人就完全不回。
export const HP_REGEN_DELAY = 5; // 最後一次受傷後要撐過幾秒才開始回
export const HP_REGEN_RATE = 4.5; // 每秒回復量
export const HP_REGEN_SAFE_DISTANCE = 40; // 這個距離內有活著的巨人就中斷回血
export const GRAVITY = 22;
export const AIR_DRAG = 0.19; // 每秒速度衰減比例（沒有這個會越盪越快）
export const MAX_SPEED = 68;
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

// ── 立體機動裝置（ODM）────────────────────────────────────
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
export const GAS_THRUST = 84; // 噴射推力（沿視線方向）
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

// ── 巨人 ─────────────────────────────────────────────────
// height 是身高（公尺），napeHp 是後頸弱點的耐久，speed 是行走速度。
// 身高刻意壓在城牆高度（52m）與最高建築（約 48m）之下，
// 不然大型巨人會直接高過天際線，反而看不出「大」。
export const TITAN_TYPES = {
  small: { label: '小型', height: 7, napeHp: 55, speed: 9.5, damage: 18, color: 0xd9a689 },
  normal: { label: '一般', height: 16, napeHp: 100, speed: 6.5, damage: 28, color: 0xcf9c7d },
  large: { label: '大型', height: 25, napeHp: 165, speed: 5, damage: 42, color: 0xc08e6f },
  abnormal: { label: '奇行種', height: 17, napeHp: 120, speed: 13, damage: 34, color: 0xb87f6a },
};

export const TITAN_ATTACK_COOLDOWN = 1.6;
export const TITAN_STAGGER_TIME = 1.8; // 砍斷手腳後的硬直
export const TITAN_LIMB_HP = 45; // 手腳的耐久，砍掉會硬直

// ── 關卡 ─────────────────────────────────────────────────
export const WAVE_BREAK_TIME = 8; // 波次之間的喘息時間（也是主要的回血窗口）
export const WAVE_BASE_COUNT = 3; // 第 1 波的巨人數
export const WAVE_GROWTH = 1.6; // 每波增加的數量

// ── 城區 ─────────────────────────────────────────────────
export const CITY_RADIUS = 300; // 城牆內半徑
export const WALL_HEIGHT = 52;
export const BLOCK_SIZE = 46; // 一個街廓的邊長
export const STREET_WIDTH = 16;
