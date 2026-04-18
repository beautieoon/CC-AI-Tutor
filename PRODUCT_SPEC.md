# Kira AI Tutor — 学生端行为规格（V2）

## 技术栈
- React 19 + Vite，单文件架构（src/App.jsx）
- 纯 inline styles，无外部 CSS/UI 库
- Web Speech API（TTS 朗读 + 未来 STT）
- Anthropic Claude API（claude-sonnet-4-5-20251001，通过 Vite proxy）
- 内容数据（故事、题目、词汇）硬编码在 App.jsx 顶部常量

---

## 1. 全局架构

### 1.1 页面流转

```
P0 Intro → P1 Warm-up → P2 Echo Reading → P3 Guided Reading
→ Upload → P4 Self-rating → P5 Comprehension → P6 Results → Back to Home
```

- 线性推进，不可跳过，不可倒退（P1 词汇内部可 Back）
- 进度条：7 段（P0–P6），当前段高亮，Upload 不占段
- 页面切换：主内容区 300ms fade；Kira 角色**不** fade，跨页持续显示
- 页面切换瞬间：Kira → neutral，取消当前 TTS，保留位置（右下角；P5 例外在右上）
- 进度条不 fade，平滑过渡到下一段

### 1.2 全局 Session 状态

```js
session = {
  student_id: string,
  task_id: string,
  grade: 'K' | '1' | '2' | '3' | '4' | '5',
  grade_band: 'K-2' | '3-5',        // 派生值，用于文案和交互适配
  started_at: timestamp,
  current_page: 'P0'|'P1'|'P2'|'P3'|'Upload'|'P4'|'P5'|'P6',
  self_rating: null | 'easy' | 'medium' | 'hard',
  completed: null | boolean,          // P3：true=读完全文，false=主动点 Done
  comprehension_answers: [],
  recording_blob: null | Blob,
  upload_status: 'pending'|'uploading'|'success'|'failed'|'no_recording',
  ai_results: { spark: null|string, mirror: null|string }
}
```

### 1.3 Grade 来源

```
优先级：
1. URL 参数 ?grade=2（覆盖用，主要给原型测试）
2. GET /api/tasks/:task_id → task.grade
3. 默认 'K'（最保守假设）

grade_band 派生：
  grade ∈ ['K','1','2'] → 'K-2'
  grade ∈ ['3','4','5'] → '3-5'
```

### 1.4 年级适配总览

| 维度 | K-2 | 3-5 |
|---|---|---|
| Kira 开场白 | 具体、短句 | 稍抽象、可含修辞 |
| Self-rating 选项 | 仅 emoji（😄😐😓） | 文字 |
| Comprehension 题数 | 2 道 | 3 道 |
| Echo 卡壳阈值 | 停顿 >5s | 停顿 >3s |
| P6 结果脚本 | 简单词汇版 | 完整版 |
| TTS 语速 | rate 0.88 | rate 0.92 |

### 1.5 Session 恢复

```
存储：
  - localStorage: 'kira_session_draft'（原型阶段，仅前端）
  - 后端：每次页面切换写 POST /api/sessions/:id/progress（正式版）

恢复规则：
  - 未完成 → 提示 "Welcome back! Want to keep reading where you left off?"
    CTA: "Yes, keep going" / "Start over"
  - 已完成 → 直接显示 P6 结果

恢复后 Kira：
  - mood: neutral
  - 播放欢迎回归 TTS（不是原页面开场白）
  - P3 恢复且有录音 → 保留录音，可继续或 Start over
  - P5 及之后恢复 → 答题进度保留

原型阶段：只用 localStorage，不做后端同步
```

---

## 2. Kira 角色规格

### 2.1 视觉
- SVG 动画角色，紫色圆润造型
- 固定位置：页面右下角（P5 理解题时移到右上）
- 尺寸：120×120px（移动端 80×80px）
- 点击 Kira → 重播最近一句 TTS（任何页面）
- 长按 / 拖拽 → 无效果（防误触）

### 2.2 动画状态机

| mood | 触发条件 | 动画表现 | 持续时间 |
|---|---|---|---|
| neutral | 默认 | 轻微上下浮动（2s 循环），眨眼（每 4s） | 持续 |
| talking | TTS 正在播放 | 嘴型开合（100ms 周期），身体轻微前倾 | TTS 期间 |
| listening | 麦克风录音中 | 头微倾 15°，眼珠缓慢左右移动，耳朵竖起 | 录音期间 |
| celebrating | 完成庆祝时 | 手臂上扬，弹跳（200ms），嘴角上扬 | 3s 后回 neutral |
| cautious | hard 评级选择时 | 嘴角平直，身体略微后缩，眼睛温和 | 3s 后回 neutral |

### 2.3 语音规格

| 属性 | 值 |
|---|---|
| 引擎 | Web Speech API speechSynthesis |
| 优先声音 | Samantha > Karen > Moira > 系统默认女声 |
| rate | K-2: 0.88 / 3-5: 0.92 |
| pitch | 1.1 |
| 失败降级 | 不播语音，直接显示文字气泡，按钮正常解锁 |

### 2.4 TTS 播放规则

| 规则 | 说明 |
|---|---|
| 排队播放 | 同一时间只有一句 TTS，新触发取消当前 |
| 用户可打断 | 点任何按钮（如 Next）立即停止当前 TTS |
| 文字同步 | 播放时对应文字气泡逐词出现（K-2: 30字符/s，3-5: 50字符/s） |
| 气泡持续 | TTS 结束后气泡保留 5s 再淡出，除非新气泡出现 |

---

## 3. 各页面详细规格

### P0 — Intro

**目的**：介绍 Kira，建立情感连接

**状态流**：`kira_speaking` → `ready`（TTS 失败直接进 ready）

| 状态 | UI | Kira |
|---|---|---|
| kira_speaking | 「Let's go!」灰色禁用 | mood: talking，播放开场白 |
| ready | 「Let's go!」亮色可点 | mood: neutral，气泡保留 |

**Kira 台词**：

| grade_band | 台词 |
|---|---|
| K-2 | "Hi! I'm Kira, your reading buddy! Today we have a story about a little caterpillar who changes into something amazing. Ready to find out what happens?" |
| 3-5 | "Hi! I'm Kira, your reading buddy. Today's story is about a caterpillar that goes through an incredible change. I wonder — have you ever felt like you were becoming someone new?" |

**边界**：TTS 失败 → 显示文字气泡，按钮立即解锁；进入 400ms 后触发 TTS

---

### P1 — Warm-up

**目的**：预习难词，降低阅读障碍

**内容数据**（原型 2 词，正式版 AI 选词最多 3 词）：
- chrysalis（chrys·A·lis）— "a hard shell a caterpillar makes before it becomes a butterfly"
- caterpillar（cat·er·PIL·lar）— "a worm-like creature that turns into a butterfly"

**正式版 AI 选词逻辑**：
```
输入：故事全文 + grade + 最近 30 天已预热词列表
逻辑：
  1. 提取 tier 2/3 词汇（低频、学术性）
  2. 排除近期已预热词
  3. 按 grade 词表过滤（K-2 排除 5+ 音节词，3-5 排除 8+ 音节词）
  4. 选出最多 3 个"障碍最大"的词（可能影响理解的优先）
输出：[{ word, syllables, definition }]
```

**每词状态流**：`kira_pronounce` → `can_proceed`

| 状态 | UI | Kira |
|---|---|---|
| kira_pronounce | 词卡 + 音节拆解 + 释义，「Next」禁用 | mood: talking，TTS 读词 |
| can_proceed | 「Hear it again」可点，「Next」可点 | mood: neutral |

**Kira 台词**：
- 词 1："Let's learn two new words! I'll say them first, then you try. Chrysalis. That's chrys — A — lis."
- 词 2："Next word — caterpillar. Cat — er — PIL — lar."

**边界**：快速连点「Hear it again」→ 取消当前 TTS 重新开始；400ms 延迟自动播放

---

### P2 — Echo Reading

**目的**：跟 Kira 逐句朗读，建立语感

**内容**（5 句）：
1. "A caterpillar crawled slowly along a branch."
2. "It found a safe spot and began to spin a chrysalis around itself."
3. "Inside the chrysalis, something amazing happened."
4. "The caterpillar changed."
5. "Days later, a beautiful butterfly pushed its way out and flew into the bright blue sky."

**每句状态流**：`kira_reading` → `student_turn` → `recording` → `done_sentence`

| 状态 | UI | Kira | 时间限制 |
|---|---|---|---|
| kira_reading | 当前句蓝色高亮，「Hear it again」可点 | mood: talking，TTS 读句 | — |
| student_turn | 绿色麦克风 + 「Next」跳过 | mood: listening | — |
| recording | 红色录音指示 + 波形 + 计时器 + 「Done」 | mood: listening | **15s** 自动结束 |
| done_sentence | 星星动画 | mood: celebrating（0.5s） | 非末句 3.2s 自动进下句 |

**边界**：
- 总时长上限 75s，超时跳过剩余句直接进 P3（`echo_phase_time_limit_reached` 事件）
- 最后一句完成后 2.2s 自动跳转 P3
- 「Next」跳过 = 不录音直接进 done_sentence
- 麦克风权限被拒 → 错误提示，「Next」始终可用

---

### P3 — Guided Reading

**目的**：独立朗读全文，Kira 陪同

**设计原则：无时间压力** — P3 没有倒计时 timer

**状态流**：`idle` → `previewing` / `reading` → `reading_silence_check` → `finished`

| 状态 | UI | Kira |
|---|---|---|
| idle | 全文 + 「Hear it first」+ 麦克风按钮 | mood: talking（进入时播开场台词），之后 neutral |
| previewing | 词逐词**黄色**高亮 + 「Stop」 | mood: talking，TTS 读全文 |
| reading | 红色录音指示 + 词逐词**紫色**高亮（480ms/词）+ 「Start over」+「Done」 | mood: listening，气泡 "I'm listening!" |
| reading_silence_check | 高亮停在最后一词，3s 倒数 | mood: listening |
| finished | 「Continue →」出现 | mood: celebrating（1s），然后 neutral |

**"最后一词 + 3s 静默"实现**：
```
读到最后一词时：
  1. 清除 advancing interval
  2. 启动 3000ms setTimeout
     - 原型阶段：3s 到直接进 finished，completed = true
     - 正式版：期间若检测到语音活动 → 重置，回 reading
  孩子点 Done → 立即进 finished，completed = false
```

**session.completed 含义**：
- `true` = 紫色高亮到最后一词 + 3s 静默
- `false` = 孩子主动点 Done 提前结束

**Micro-Intervention 规则**：

```
MAX_EMOTIONAL_INTERVENTIONS = 3

当前词停顿时间 > 阈值（K-2: >5s / 3-5: >3s）
  → 条件 A：卡壳
  → Kira TTS 读出该词 + 鼓励（次数不限）

累计情绪干预次数 < MAX_EMOTIONAL_INTERVENTIONS(3)
  → 计数器 +1，继续朗读

累计情绪干预次数 >= MAX_EMOTIONAL_INTERVENTIONS(3)
  → 不再触发情绪干预，继续朗读

原型阶段简化：停顿检测用固定 480ms/词计时模拟，7s 时触发一次卡壳辅助
```

**Kira 台词**：
- 进入 idle："Let's start reading! Tap the mic when you're ready."
- 进入 reading（气泡）："I'm listening!"
- 卡壳辅助："Tricky word — [音节拆解]. Keep going!"（原型：第 7 秒固定触发）
- 结束（读完）："You did it!"（K-2）/ "Nice — you made it through!"（3-5）

**边界**：
- 「Start over」→ 清空录音 + 重置高亮 + 回 idle，Kira 说 "No problem — let's try again!"
- 「Hear it first」播放中点麦克风 → 停止 TTS，进入 reading
- 录音中点「Hear it first」→ 无效（按钮隐藏）
- 麦克风权限被拒 → 显示提示，「Hear it first」仍可用

---

### Upload — 录音上传

**目的**：上传录音，防止提前关页面

**前置判断**：
```
P3 finished → 检查 recording_blob：
  有 blob → 进 Upload 页
  无 blob → 跳过 Upload，直接 P4
    session.guided_reading.upload_status = 'no_recording'
```

**状态流**：`uploading` → `success`（1.5s 后进 P4）
                        → `failed` → retry（最多 3 次）→ 3 次仍失败 → skip 进 P4

**三种最终结果**：`success` / `failed_skipped` / `no_recording`

| 状态 | UI | Kira |
|---|---|---|
| uploading | 进度条动画 + 文案 | mood: neutral |
| success | 进度条 100% + 绿色勾 | mood: celebrating（1s） |
| failed | 错误文案 + 「Try again」 | mood: cautious |

**文案**：

| 场景 | 主文案 | 副文案 |
|---|---|---|
| 正常上传 | "Saving your reading..." | "Almost done! Please wait here." |
| 上传失败 | "Oops! We need to try again." | "Please stay on this page." |

**上传 API**：
```
POST /api/recordings
Body: session_id, student_id, task_id, audio (WebM/Opus, <10MB), duration_ms, completed
Response 200: { recording_url: string }
Response 413: { error: "file_too_large" }
Response 5xx: { error: "upload_failed" }
```

---

### P4 — Self-rating

**目的**：孩子自评难度，Kira 接纳回应

**状态流**：`prompting` → `selected` → `responding` → `can_proceed`

**Kira 提示语**：K-2: "How did that feel? Tap one!" / 3-5: "How did that feel? Just tap one."

**K-2 选项**（纯 emoji）：

| 选项 | self_rating | Kira 回应 | Kira mood |
|---|---|---|---|
| 😄 | easy | "I could tell — you sounded so confident!" | celebrating |
| 😐 | medium | "You kept going — that's what matters." | neutral |
| 😓 | hard | "That's okay — tricky parts help you grow." | cautious |

**3-5 选项**（文字）：

| 选项 | self_rating | Kira 回应 | Kira mood |
|---|---|---|---|
| That was easy! | easy | "I could tell — you sounded so confident!" | celebrating |
| A few tricky parts | medium | "You kept going — that's what matters." | neutral |
| Really tough today | hard | "That's okay — tricky parts help you grow." | cautious |

**边界**：点击即锁定，不可更改；TTS 失败直接显示文字，选项立即可点

---

### P5 — Comprehension

**目的**：检验理解

**布局**：左右分栏（左：故事全文 300px 固定；右：题目区）

**题目数**：K-2 / Grade 3 → 2 道；Grade 4-5 → 3 道

**每题状态流**：
```
answering
  → correct（绿色标记，自动进下一题）
  → wrong_1_prompt（红色标记 + hint 按钮出现）
      → [TAP_SHOW_HINT] → wrong_1_hinted（左侧高亮，仍可答题）
      → [SUBMIT_CORRECT] → correct
      → [SUBMIT_WRONG_2ND] → wrong_2
  → wrong_1_hinted
      → [SUBMIT_CORRECT] → correct
      → [SUBMIT_WRONG_2ND] → wrong_2
  → wrong_2（Kira 说答案，正确项绿色标记，进下一题）
```

| 状态 | UI | Kira |
|---|---|---|
| answering | 选项可点 | mood: neutral |
| correct | 选项绿色 ✓ | mood: celebrating（1s） |
| wrong_1_prompt | 选项红色 + 「Show me where in the story」按钮出现 | mood: talking，说鼓励语 |
| wrong_1_hinted | 左侧对应句**黄色高亮** + 选项可重新点 | mood: neutral |
| wrong_2 | 正确选项绿色 ✓ | mood: talking，说答案 |

**Kira 台词**：
- 答错第 1 次："I see why you'd think that — the answer is somewhere in the story. Can you find it?"
- 答错第 2 次："The answer is '[正确答案]' — the story tells us right in the highlighted part."

**Hint 高亮逻辑**：
- 每题有 `hint_start` / `hint_end`（字符位置）
- 找故事文本中与该范围有重叠的完整句子，整句黄色高亮
- 高亮在下一题开始时清除
- `used_hint` 字段记录（analytics 用）

**最后一题完成后**：→ 开放题（原型 demo） → P6

**开放题**：

| 状态 | UI | Kira |
|---|---|---|
| asking | — | mood: talking，说出开放问题 |
| chips_shown | 3 个 chip 可点 | mood: listening |
| ai_responding | "..." 加载中 | mood: talking |
| ai_done | AI 回应气泡 + 「See results」 | mood: neutral |

Chips：`"It felt safe 🌿"` / `"It was tired 😴"` / `"I don't know 🤔"`

Kira 问题："Now I'm curious — why do you think the caterpillar decided to spin the chrysalis right there, on that branch?"

AI fallback（随机 1 条）：
- "That's an interesting thought. I wonder what it was like in there."
- "Hmm, maybe so! I wonder if the caterpillar was scared or excited."
- "I hadn't thought of that. What do you think it felt like to change?"
- "That could be! I keep wondering what it would be like to become something totally new."

---

### P6 — Results

**目的**：总结、鼓励、收尾反思

**状态流**：`celebration`（2.2s）→ `content` → `word_detail`（可选）

**阶段 1 — 庆祝动画**：彩纸粒子 + Kira celebrating + "You finished!"

**阶段 2 — 内容页**：

| 区域 | 内容 |
|---|---|
| Hero 区（紫色背景） | 评级标签 + Kira 角色 + Kira 脚本气泡 |
| 白色区 | 故事回顾 + 词汇 chip |
| 底部固定 | 「Back to Home」（唯一出口） |

**评级标签**（替代星星）：

| rating × completed | 标签 |
|---|---|
| easy + done | Great effort! |
| easy + stopped | Nice work! |
| medium + done | Great effort! |
| medium + stopped | Keep it up! |
| hard + done | Great effort! |
| hard + stopped | Keep it up! |

**Kira 脚本（K-2）**：

| key | 台词 |
|---|---|
| easy_done | "You read that so well! I keep wondering — what do you think the caterpillar was thinking while it waited inside?" |
| easy_stopped | "You read so much of the story! Next time you might finish the whole thing." |
| medium_done | "You read the whole story — that's not easy to do! Do you think the butterfly knew it used to be a caterpillar?" |
| medium_stopped | "You kept reading even when it got hard. That's not easy to do!" |
| hard_done | "You said it was really tough — but you finished it! That's the part I want you to remember." |
| hard_stopped | "That was a big story. I'm glad you tried! It gets easier the more you read it." |

**Kira 脚本（3-5）**：

| key | 台词 |
|---|---|
| easy_done | "You read that smoothly — I could tell. I keep wondering: what do you think the caterpillar was thinking while it waited inside?" |
| easy_stopped | "You said it felt easy! I noticed you made it through most of the story. Next time you might finish the whole thing." |
| medium_done | "You made it through the whole thing — that's what matters. I'm curious, do you think the butterfly knew it used to be a caterpillar?" |
| medium_stopped | "You kept going even when it got tricky. That takes real effort. I wonder what part felt hardest for you." |
| hard_done | "You said it felt really tough — but you finished it. That's the part I want you to remember. I wonder what it feels like to do something hard and still make it through." |
| hard_stopped | "That was a lot to take on. I'm glad you tried. Sometimes a story needs a few reads before it feels like yours." |

**AI 生成**：进入时异步调 AI（KIRA_SYSTEM_MIRROR），**超时 5s 走 fallback**，AI 返回前显示 "..."

**词汇 chip 交互**：点击展开 word detail 卡（音节拆解 + 释义 + 「Hear it again」），同时只展开一个

---

## 4. AI 集成规格

### 4.1 调用函数

```js
callKiraAI(systemPrompt, userContext) → Promise<string | null>
```

| 属性 | 值 |
|---|---|
| 端点 | `/api/anthropic/v1/messages`（Vite proxy → api.anthropic.com） |
| 模型 | `claude-sonnet-4-5-20251001` |
| max_tokens | **150** |
| 超时 | **5s**（超时返回 null） |
| 失败处理 | 返回 null，调用方走 fallback |
| 正式版 | 需迁移到后端代理，前端不暴露 API Key |

### 4.2 System Prompts

**KIRA_SYSTEM_SPARK（P5 开放题）**：
```
You are Kira, a warm reading buddy for ages 6-9.
Rules:
- 2 sentences max
- NEVER say "great", "correct", "good job", or give scores
- Sentence 1: respond sincerely to what the child said
- Sentence 2: end with a curious, open-ended question
- Use Grade 2 reading level vocabulary
- Sound like a curious friend, not a teacher
```

**KIRA_SYSTEM_MIRROR（P6 结果页）**：
```
You are Kira, a warm reading buddy for ages 6-9.
Rules:
- 2 sentences max
- NEVER say "great", "correct", "good job", or give scores
- Sentence 1: reflect the child's effort, not performance
- Sentence 2: a wondering question with no right answer
- Use Grade 2 reading level vocabulary
- If the child said it was hard but finished: acknowledge the contrast
- If the child said it was easy but stopped early: gently mention progress without shame
```

### 4.3 AI 触发点

| 页面 | 触发时机 | 传入上下文 | Fallback |
|---|---|---|---|
| P5 开放题 | 孩子点选 chip | chip 内容 + 问题文本 | 4 条预设（随机） |
| P6 结果页 | 页面进入时 | self_rating + completed + story_title | 6 条交叉脚本 |

---

## 5. 错误与边界处理

| 场景 | 处理 | 文案 |
|---|---|---|
| TTS 失败 | 静默降级：显示文字气泡，按钮正常解锁 | 无 |
| 麦克风权限被拒 | 弹出提示，提供 Retry | "Kira needs to hear you! Ask your teacher for help." |
| AI 超时（>5s） | 走 fallback，用户无感知 | 无 |
| AI 返回不合规内容 | 走 fallback | 无 |
| 网络断开（上传） | 本地缓存录音，显示 Retry | "Oops! We need to try again." |
| 浏览器不支持 Speech API | 提示 | 学生："Ask your teacher to help set things up!" |
| 录音过大（>10MB） | 压缩重传，仍失败则标记 upload_failed | 无 |
| 页面意外关闭 | 下次打开恢复到最后完成的页面 | — |

---

## 6. 数据持久化

### 6.1 Session 数据模型

```js
Session {
  id: uuid,
  student_id: string,
  task_id: string,
  grade: string,
  started_at: timestamp,
  completed_at: timestamp | null,

  echo_sentences: [{
    index: number,
    skipped: boolean,
    duration_ms: number | null
  }],

  guided_reading: {
    completed: boolean,       // true=读完全文，false=主动点 Done
    duration_ms: number,
    intervention_count: number,
    recording_url: string | null,
    upload_status: 'success'|'failed'|'no_recording'
  },

  self_rating: 'easy'|'medium'|'hard',

  comprehension_answers: [{
    question_index: number,
    attempts: number,
    correct: boolean,
    used_hint: boolean
  }],

  result_label: string,
  kira_script_key: string,
  ai_generated_script: string | null
}
```

### 6.2 Analytics 事件

| 事件名 | 触发时机 | 附加数据 |
|---|---|---|
| session_started | P0 进入 | student_id, task_id, grade |
| page_entered | 每个页面进入 | page_id |
| warmup_word_heard | 点击 Hear it again | word_index, replay_count |
| echo_sentence_completed | 每句完成/跳过 | sentence_index, skipped, duration_ms |
| echo_phase_time_limit_reached | 75s 到时 | sentences_completed |
| guided_reading_started | 点麦克风 | — |
| guided_reading_preview | 点 Hear it first | — |
| intervention_triggered | 干预触发 | type(stuck/emotion), word_index |
| guided_reading_completed | 朗读结束 | completed, duration_ms |
| recording_upload_result | 上传完成 | status, retry_count, file_size |
| self_rating_selected | 选择评级 | rating |
| comprehension_answered | 每题提交 | q_index, correct, attempt, used_hint |
| comprehension_hint_used | 点「Show me where in the story」 | q_index |
| open_question_chip | 选 chip | chip_text |
| session_completed | P6 点 Back to Home | total_duration_ms |

---

## 7. 文件结构

```
kira-reading/
├── src/
│   └── App.jsx          # 全部逻辑（单文件架构）
├── vite.config.js       # Vite 配置，含 /api/anthropic proxy
├── .env                 # VITE_ANTHROPIC_KEY=sk-ant-xxx（本地，不提交）
├── .env.example         # Key 占位示例
└── PRODUCT_SPEC.md      # 本文档（V2）
```

---

## V3 规划项（本 spec 不实现）

### Session 级时长控制
- **场景**：教师可为单个 task assignment 设置最长时长（如 15 分钟）
- **触发范围**：仅 P3 Guided Reading 阶段生效（P0/P1/P2/P4/P5/P6 不受限）
- **到时行为**：录音自动 finalize，`completed = false`（等同主动点 Done）
- **Upload 页**：显示 "Time's up! Saving your reading..." 文案变体
- **最短时长**：5 分钟（防误设置）
- **教师配置入口**：assignment 创建/编辑页
- **最短时长**：5 分钟

### 开放题多轮对话 + 语音输入
- 用 `window.SpeechRecognition` 做 STT（原型阶段，Chrome 支持最好）
- messages 数组累积对话历史传给 Claude
- System prompt 加：2-3 轮后自然收尾，不再追问
- UI：麦克风按钮替换 chip，对话气泡展示历史
