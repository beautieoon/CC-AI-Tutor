# Kira AI Tutor — 学生端产品规格文档

## 技术栈
- React 19 + Vite，单文件架构（src/App.jsx，~1400行）
- 纯 inline styles，无外部 CSS/UI 库
- Web Speech API（TTS 朗读）
- Anthropic Claude API（claude-sonnet-4-5，通过 Vite proxy 调用）
- 所有内容数据（故事、题目、词汇）硬编码在 App.jsx 顶部常量中

---

## 页面流转

```
[P0 Intro] → [P1 Warm-up] → [P2 Echo Reading] → [P3 Guided Reading] → [P4 Self-rating] → [P5 Comprehension] → [P6 Results]
```

进度条线性推进，不可跳过，不可倒退（除 P1 单词可 Back）。

---

## 各页详细规格

### P0 — Intro（介绍页）
**目的**：介绍 Kira，建立情感连接

**交互规则**：
- 进入后 Kira 自动播放 TTS 开场白
- 开场白播完后才解锁「Let's go 🚀」按钮（`ready` state）
- 点击按钮立即跳转 P1

**Kira 台词**：
> "Hi! I'm Kira, your reading buddy. Today's story is about something that completely changes. I wonder — have you ever felt like you were turning into a different version of yourself?"

---

### P1 — Warm-up（词汇预热）
**目的**：预习故事里的难词，降低阅读障碍

**内容数据**：
- 词 1：chrysalis（chrys·A·lis）— "a hard shell a caterpillar makes before it becomes a butterfly"
- 词 2：caterpillar（cat·er·PIL·lar）— "a worm-like creature that transforms into a butterfly or moth"

**交互规则**：
- 进入每个词自动播放发音（400ms 延迟后触发）
- 播完解锁 Next 按钮（`canProceed` state）
- 「🔊 Tap to hear」可反复点击重听，每次重新播放
- Back 按钮：回到上一个词（第一词时 Back 禁用）
- 最后一词 Next 变为「Continue →」跳转 P2

**Kira 台词**（TTS）：
- 词 1：*"These words are a little tricky. Let me read them for you first. Chrysalis. That's chrys — A — lis."*
- 词 2：*"Next word — caterpillar. Cat — er — PIL — lar."*

---

### P2 — Echo Reading（跟读练习）
**目的**：孩子跟 Kira 逐句朗读，建立语感

**内容数据**（5句）：
1. "A caterpillar crawled slowly along a branch."
2. "It found a safe spot and began to spin a chrysalis around itself."
3. "Inside the chrysalis, something amazing happened."
4. "The caterpillar changed."
5. "Days later, a beautiful butterfly pushed its way out and flew into the bright blue sky."

**每句状态流**：
```
kira_reading → student_turn → recording → done_sentence → [自动进下一句]
```

**交互规则**：
- `kira_reading`：Kira TTS 朗读当前句，有「🔊 Hear again」可重听
- `student_turn`：出现绿色麦克风按钮，提示孩子复述
- `recording`：录音计时，最长 **6秒** 自动结束；有「Done ✓」手动结束；显示波形动画
- `done_sentence`：展示星星动画，非最后句 3.2s 后自动进下一句
- 最后句完成后 **2.2s 自动跳转** P3
- `student_turn` 阶段有「skip →」可跳过当前句
- **无 Back**，只能向前

---

### P3 — Guided Reading（自主朗读）
**目的**：孩子独立朗读全文，Kira 陪同

**交互规则**：
- 进入自动播放："Let's start reading! Tap the mic when you're ready."
- 默认状态：「Hear it first」预听按钮 + 麦克风按钮
- 「Hear it first」：Kira TTS 朗读全文，词语逐词**黄色高亮**同步（可中途 Stop）
- 点麦克风开始录音：
  - 倒计时 **60秒**，词语逐词**紫色高亮**（480ms/词）
  - 录音中显示红色录音指示器
  - 有「↺ start over」完全重置（清空计时和高亮）
  - 录音中 Kira 持续陪同："I'm with you 👂"
- **第7秒**触发 Kira 说："Tricky word — chrys·A·lis. Keep going!"

**两种结束方式（决定后续脚本分支）**：
| 结束方式 | 触发条件 | `completed` 值 |
|---|---|---|
| 读完 | 词高亮跑完最后一词 | `true` |
| 超时 | 60秒倒计时归零 | `false` |

- 结束后出现「Continue →」跳转 P4，同时传递 `completed` 值

---

### P4 — Self-rating（自评）
**目的**：孩子自我感知本次阅读难度，Kira 接纳并回应

**交互规则**：
- 进入自动播放："How did that feel? Just tap one."
- 三选一，**点击即锁定**，不可更改，其余选项变透明
- 选后 Kira 立即语音回应

**选项 & Kira 即时回应**：
| 选项 | Kira 回应 | Kira 动画 |
|---|---|---|
| 😄 That felt smooth | "Glad it felt good." | celebrating |
| 😐 A few tricky parts | "You kept going — that's what matters." | neutral |
| 😓 Really tough today | "That's okay — tricky parts help you grow." | cautious |

**解锁条件**：选择后 + Kira 回应语音播完，才出现「Continue →」

---

### P5 — Comprehension（理解题）
**目的**：检验理解，引发深度思考

**页面布局**：左右分栏
- 左侧（固定宽 300px）：故事全文，有播放音频按钮，答错时句子高亮
- 右侧：题目区域

**内容数据**：
- Q1："What did the caterpillar make around itself?" 答案：B. A chrysalis
- Q2："What came out of the chrysalis?" 答案：C. A butterfly
- 开放题："Now I'm curious — why do you think the caterpillar decided to spin the chrysalis right there, on that branch?"

**选择题规则（Q1 & Q2 相同）**：
| 提交次数 | 答对 | 答错 |
|---|---|---|
| 第1次 | 绿色✓，自动进下一题 | 出现「💡 Show me where in the story」hint 按钮，左侧原文对应句子高亮黄色 |
| 第2次（答错后） | 绿色✓，进下一题 | Kira 说出正确答案，强制进入下一题 |

- 答错第1次 Kira 说：*"I see why you'd think that — the answer is somewhere in the story. Can you find it?"*
- 答错第2次 Kira 说：*"The answer is '[正确答案]' — the story tells us right in the highlighted part."*

**hint 高亮逻辑**：每题有 `hint_start` 和 `hint_end` 字符位置，找段落中与该范围有重叠的句子，整句高亮

**开放题规则**：
- Kira TTS 说出开放题
- 出现 3 个快选 chip（K2 适配）：
  - "It felt safe 🌿"
  - "It was tired 😴"
  - "I don't know 🤔"
- 孩子选 chip → 调用 AI（KIRA_SYSTEM_SPARK）生成个性回应
- Kira TTS 说出 AI 回应 → 出现「See results →」

---

### P6 — Results（结果页）
**目的**：总结、鼓励、收尾反思

**阶段 1 — 庆祝动画（2.2秒）**：
- 全屏彩纸粒子动画
- Kira 角色 celebrating 动画
- 文字："You finished!" + 故事名

**阶段 2 — 内容页**：

布局：
- 上方 Hero 区（紫色背景）：星星（1-3颗）+ 评级标签 + Kira 角色 + Kira 说的脚本
- 下方白色区：passage 回顾、词汇 chip、Kira 说的话（文字气泡）
- 点词汇 chip → 展开 word detail 卡片（音节拆解 + 定义）
- 底部固定：「↺ Start Over」（回 P0）+ 「Back to Home」

**脚本选择逻辑**（`rating` × `completed` 交叉）：
```js
key = `${rating}_${completed ? 'done' : 'timeout'}`
```

| key | 脚本 | 星星数 |
|---|---|---|
| easy_done | "You read that smoothly — I could tell. I keep wondering: what do you think the caterpillar was thinking while it waited inside?" | 3 |
| easy_timeout | "You said it felt easy! I noticed you made it through most of the story. Next time you might fly through the whole thing." | 2 |
| medium_done | "You made it through the whole thing — that's what matters. I'm curious, do you think the butterfly knew it used to be a caterpillar?" | 2 |
| medium_timeout | "You kept going even when it got tricky. That takes something. I wonder what part felt hardest for you." | 1 |
| hard_done | "You said it felt really tough — but you finished it. That's the part I want you to remember. I wonder what it feels like to do something hard and still make it through." | 2 |
| hard_timeout | "That was a lot to take on. I'm glad you tried. Sometimes a story needs a few reads before it feels like yours." | 1 |

**AI 生成**：进入页面时异步调用 AI，AI 结果替换 fallback 脚本（AI 返回前显示"..."）

---

## AI 集成规格

### 调用函数
```js
callKiraAI(systemPrompt, userContext) → Promise<string|null>
```
- 端点：`/api/anthropic/v1/messages`（Vite proxy 转发到 api.anthropic.com）
- 模型：`claude-sonnet-4-5-20251001`
- max_tokens：80
- API Key：环境变量 `VITE_ANTHROPIC_KEY`
- 失败时返回 `null`，调用方 fallback 到硬编码内容

### System Prompt — KIRA_SYSTEM_SPARK（开放题用）
```
你是 Kira，一个温暖的 6-9 岁阅读伙伴。
规则：
- 最多 2 句话
- 禁止说 "great / correct / good job" 或给分
- 第一句：真诚回应孩子说的内容
- 第二句：以好奇的开放问题结尾
- Grade 2 阅读水平
- 像好奇的朋友，不像老师
```

### System Prompt — KIRA_SYSTEM_MIRROR（结果页用）
```
你是 Kira，一个温暖的 6-9 岁阅读伙伴。
规则：
- 最多 2 句话
- 禁止说 "great / correct / good job" 或给分
- 第一句：反映孩子的努力，不是表现
- 第二句：一个没有标准答案的 wondering 问题
- Grade 2 阅读水平
- 如果孩子说难但读完了：承认这个反差（"you said it was tough, but you made it through"）
- 如果孩子说简单但没读完：温和地提到进步，不带羞耻感
```

### 当前 AI 触发点
| 页面 | 触发时机 | 传入上下文 | Fallback |
|---|---|---|---|
| P5 开放题 | 孩子点选 chip | 孩子选的选项 + 问题 | 4条随机预设回复 |
| P6 结果页 | 页面进入时 | 评级 + 是否读完 | 6条交叉索引硬编码脚本 |

---

## AI 扩展方向（未实现，规划中）

### 优先级高：开放题多轮对话 + 语音输入
**现状**：孩子选 chip → AI 回一句 → 结束

**目标**：
1. 孩子说话（Web Speech API SpeechRecognition 转文字）
2. 发给 Claude（带对话历史 messages 数组）
3. Kira 说回应 + 追问（2-3轮）
4. Claude 判断自然结束时机

**实现要点**：
- 用 `window.SpeechRecognition` 做 STT（原型阶段，Chrome 支持最好）
- messages 数组累积对话历史传给 Claude
- System prompt 新增："After 2-3 exchanges, wrap up naturally without asking another question"
- UI：麦克风按钮替换 chip，对话气泡展示历史

### 其他扩展点
- 词汇解释：孩子不懂某词时，AI 用类比解释并追问
- 答错后引导：不只高亮原文，Kira 用语言引导推理过程
- 自评追问：选完评级后，Kira 问"哪个句子让你觉得最难？"

---

## Kira 角色规格

**视觉**：SVG 动画角色，紫色圆润造型，有眼睛、嘴型、耳朵

**动画状态**：
| mood | 触发场景 | 表现 |
|---|---|---|
| neutral | 默认 | 轻微上下浮动 |
| talking | TTS 播放中 | 嘴型开合动画，快速抖动 |
| listening | 等待孩子输入 | 头部微倾，眼珠轻微移动 |
| celebrating | 😄 easy 评级 / 结果页进入 | 手臂上扬，大幅跳动，嘴角上扬 |
| cautious | 😓 hard 评级 | 嘴角平直，表情谨慎 |

**声音**：Web Speech API TTS，优先 Samantha/Karen/Moira 等女声，rate 0.92，pitch 1.1

---

## 文件结构
```
kira-reading/
├── src/
│   └── App.jsx          # 全部逻辑，约 1400 行
├── vite.config.js       # Vite 配置，含 /api/anthropic proxy
├── .env                 # VITE_ANTHROPIC_KEY=sk-ant-xxx（本地，不提交）
├── .env.example         # Key 占位示例
└── PRODUCT_SPEC.md      # 本文档
```
