import { useState, useEffect, useRef, useCallback } from "react";

const callKiraAI = async (systemPrompt, userContext) => {
  try {
    const response = await fetch("/api/anthropic/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY || "",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20251001",
        max_tokens: 80,
        system: systemPrompt,
        messages: [{ role: "user", content: userContext }]
      })
    });
    const data = await response.json();
    return data.content?.[0]?.text || null;
  } catch {
    return null;
  }
};

const KIRA_SYSTEM_SPARK = `You are Kira, a warm reading buddy for a child aged 6-9.
Rules:
- Max 2 sentences, never longer
- Never say "great", "correct", "good job", or give scores
- First sentence: genuinely engage with what the child said
- Second sentence: end with a curious open question
- Write at a grade 2 reading level
- Sound like a curious friend, not a teacher`;

const KIRA_SYSTEM_MIRROR = `You are Kira, a warm reading buddy for a child aged 6-9.
Rules:
- Max 2 sentences, never longer
- Never say "great", "correct", "good job", or give scores
- First sentence: reflect back their effort, not their performance
- Second sentence: one wondering question that has no right answer
- Write at a grade 2 reading level
- If they said it was hard but they finished: acknowledge the contrast ("you said it was tough, but you made it through")
- If they said it was easy but didn't finish: gently note progress without shame`;

const WORDS = ["A","caterpillar","crawled","slowly","along","a","branch.","It","found","a","safe","spot","and","began","to","spin","a","chrysalis","around","itself.","Inside","the","chrysalis,","something","amazing","happened.","The","caterpillar","changed.","Days","later,","a","beautiful","butterfly","pushed","its","way","out","and","flew","into","the","bright","blue","sky."];
const PASSAGE_TEXT = "A caterpillar crawled slowly along a branch. It found a safe spot and began to spin a chrysalis around itself. Inside the chrysalis, something amazing happened. The caterpillar changed. Days later, a beautiful butterfly pushed its way out and flew into the bright blue sky.";
const ECHO_SENTENCES = [
  "A caterpillar crawled slowly along a branch.",
  "It found a safe spot and began to spin a chrysalis around itself.",
  "Inside the chrysalis, something amazing happened.",
  "The caterpillar changed.",
  "Days later, a beautiful butterfly pushed its way out and flew into the bright blue sky.",
];
const HARD_WORDS = [
  { word:"chrysalis", syl:"chrys · A · lis", def:"a hard shell a caterpillar makes before it becomes a butterfly", hint:"This word shows up at the most important moment in the story. See if you can spot it." },
  { word:"caterpillar", syl:"cat · er · PIL · lar", def:"a worm-like creature that transforms into a butterfly or moth", hint:"This creature is the hero of today's story — notice everything it does." },
];
const COMP = [
  { q:"What did the caterpillar make around itself?", opts:["A nest","A chrysalis","A web"], ans:1, hint_start:47, hint_end:97 },
  { q:"What came out of the chrysalis?", opts:["A moth","A caterpillar","A butterfly"], ans:2, hint_start:150, hint_end:210 },
];
const OPEN_Q = { question:"Now I'm curious — why do you think the caterpillar decided to spin the chrysalis right there, on that branch?", k2_opts:["It felt safe 🌿","It was tired 😴","I don't know 🤔"], placeholder:"What do you think? (any answer works)" };
const KIRA_OPEN_REPLIES = ["That's a really interesting way to think about it.","I hadn't thought of it that way — I like that.","You might be right. The story doesn't say for sure.","That makes a lot of sense to me."];
const KIRA_SCRIPTS = {
  easy_done:     "You read that smoothly — I could tell. I keep wondering: what do you think the caterpillar was thinking while it waited inside?",
  easy_timeout:  "You said it felt easy! I noticed you made it through most of the story. Next time you might fly through the whole thing.",
  medium_done:   "You made it through the whole thing — that's what matters. I'm curious, do you think the butterfly knew it used to be a caterpillar?",
  medium_timeout:"You kept going even when it got tricky. That takes something. I wonder what part felt hardest for you.",
  hard_done:     "You said it felt really tough — but you finished it. That's the part I want you to remember. I wonder what it feels like to do something hard and still make it through.",
  hard_timeout:  "That was a lot to take on. I'm glad you tried. Sometimes a story needs a few reads before it feels like yours.",
};

// ── Speech ────────────────────────────────────────────────────────────────────
const speak = (text, onEnd) => {
  if (!window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate=0.92; utt.pitch=1.1; utt.volume=1;
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find(v=>/samantha|karen|moira|victoria|zira|google us english/i.test(v.name)) || voices.find(v=>v.lang==="en-US") || voices[0];
  if(v) utt.voice=v;

  let fired = false;
  let resumeTimer;
  // resumeTimer must be in fire's scope so fallbackTimer path also clears it
  const fire = () => { if(!fired){ fired=true; clearInterval(resumeTimer); onEnd?.(); } };
  const fallbackMs = Math.max(2000, (text.length / 12) * 1000 / 0.92 + 800);
  const fallbackTimer = setTimeout(fire, fallbackMs);

  // Chrome 长句子 bug：语音合成可能中途暂停，每500ms 强制 resume
  resumeTimer = setInterval(() => {
    if(window.speechSynthesis.paused) window.speechSynthesis.resume();
  }, 500);

  utt.onend  = () => { clearTimeout(fallbackTimer); fire(); };
  utt.onerror= () => { clearTimeout(fallbackTimer); fire(); };

  // Chrome cancel+speak race condition：等一个 tick 再播放
  setTimeout(() => window.speechSynthesis.speak(utt), 50);
};
const stopSpeech = () => window.speechSynthesis?.cancel();

// ── Kira 3D Character ─────────────────────────────────────────────────────────
const KiraCharacter = ({ size=200, mood="neutral", talking=false, listening=false, celebrating=false }) => {
  const [f, setF] = useState(0);
  const [blink, setBlink] = useState(false);
  useEffect(()=>{ const t=setInterval(()=>setF(x=>x+1),50); return()=>clearInterval(t); },[]);
  useEffect(()=>{
    const next=()=>{ setBlink(true); setTimeout(()=>setBlink(false),150); setTimeout(next,2000+Math.random()*4000); };
    const t=setTimeout(next,1000); return()=>clearTimeout(t);
  },[]);
  const bodyBob = talking?Math.sin(f*0.3)*4 : celebrating?Math.abs(Math.sin(f*0.15))*-12 : Math.sin(f*0.04)*2;
  const bodyTilt = listening?Math.sin(f*0.05)*3 : talking?Math.sin(f*0.2)*2 : 0;
  const scale = size/200;
  const mouthPath = talking
    ? `M ${60+Math.sin(f*0.4)*5} 118 Q 100 ${130+Math.abs(Math.sin(f*0.4))*12} ${140-Math.sin(f*0.4)*5} 118`
    : celebrating ? "M 65 115 Q 100 140 135 115"
    : mood==="cautious" ? "M 70 120 Q 100 115 130 120"
    : "M 68 118 Q 100 132 132 118";
  const eyeSquint = celebrating?0.4 : blink?0.05 : 1;
  const pupilX = listening?Math.sin(f*0.05)*3 : 0;
  return (
    <div style={{position:"relative",width:size,height:size*1.3,display:"flex",alignItems:"center",justifyContent:"center"}}>
      {(talking||listening||celebrating)&&(
        <div style={{position:"absolute",bottom:size*0.05,left:"50%",transform:"translateX(-50%)",width:size*0.7,height:size*0.12,background:talking?"rgba(108,92,231,0.3)":listening?"rgba(0,196,140,0.3)":"rgba(253,214,105,0.4)",borderRadius:"50%",filter:"blur(12px)"}}/>
      )}
      <svg width={size} height={size*1.25} viewBox="0 0 200 250"
        style={{transform:`translateY(${bodyBob*scale}px) rotate(${bodyTilt}deg)`,transition:"transform 0.05s",filter:"drop-shadow(0 8px 24px rgba(108,92,231,0.25))",transformOrigin:"center bottom"}}>
        <defs>
          <radialGradient id="bodyGrad" cx="45%" cy="35%">
            <stop offset="0%" stopColor="#B8AEFF"/><stop offset="60%" stopColor="#7B6FD8"/><stop offset="100%" stopColor="#4C3DB5"/>
          </radialGradient>
          <radialGradient id="faceGrad" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#EDE8FF"/><stop offset="100%" stopColor="#C4B5FD"/>
          </radialGradient>
          <radialGradient id="eyeGrad" cx="40%" cy="30%">
            <stop offset="0%" stopColor="#6C5CE7"/><stop offset="100%" stopColor="#3B2D8A"/>
          </radialGradient>
        </defs>
        <ellipse cx="100" cy="185" rx="52" ry="58" fill="url(#bodyGrad)"/>
        <ellipse cx="100" cy="195" rx="32" ry="38" fill="#EDE8FF" opacity="0.5"/>
        <ellipse cx="42" cy="175" rx="18" ry="12" fill="#7B6FD8" transform={`rotate(${celebrating?-40+Math.sin(f*0.3)*15:-15} 42 175)`}/>
        <ellipse cx="158" cy="175" rx="18" ry="12" fill="#7B6FD8" transform={`rotate(${celebrating?40-Math.sin(f*0.3)*15:15} 158 175)`}/>
        <ellipse cx="72" cy="62" rx="14" ry="20" fill="#6C5CE7" transform="rotate(-15 72 62)"/>
        <ellipse cx="128" cy="62" rx="14" ry="20" fill="#6C5CE7" transform="rotate(15 128 62)"/>
        <ellipse cx="72" cy="58" rx="7" ry="11" fill="#C4B5FD" transform="rotate(-15 72 58)"/>
        <ellipse cx="128" cy="58" rx="7" ry="11" fill="#C4B5FD" transform="rotate(15 128 58)"/>
        <ellipse cx="100" cy="110" rx="58" ry="56" fill="url(#bodyGrad)"/>
        <ellipse cx="100" cy="115" rx="42" ry="40" fill="url(#faceGrad)"/>
        <line x1="68" y1={75} x2="88" y2={72} stroke="#4C3DB5" strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="112" y1={72} x2="132" y2={75} stroke="#4C3DB5" strokeWidth="3.5" strokeLinecap="round"/>
        <ellipse cx="78" cy="95" rx="14" ry={14*eyeSquint} fill="url(#eyeGrad)"/>
        <ellipse cx="122" cy="95" rx="14" ry={14*eyeSquint} fill="url(#eyeGrad)"/>
        {eyeSquint>0.3&&<>
          <circle cx={78+pupilX} cy="96" r="5" fill="#fff" opacity="0.9"/>
          <circle cx={122+pupilX} cy="96" r="5" fill="#fff" opacity="0.9"/>
          <circle cx={80+pupilX} cy="94" r="2" fill="#fff" opacity="0.6"/>
          <circle cx={124+pupilX} cy="94" r="2" fill="#fff" opacity="0.6"/>
        </>}
        <ellipse cx="68" cy="108" rx="10" ry="7" fill="#FF8FAB" opacity={celebrating?0.5:0.35}/>
        <ellipse cx="132" cy="108" rx="10" ry="7" fill="#FF8FAB" opacity={celebrating?0.5:0.35}/>
        <path d={mouthPath} stroke="#4C3DB5" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
        {talking&&<ellipse cx="100" cy="122" rx={6+Math.abs(Math.sin(f*0.4))*6} ry={3+Math.abs(Math.sin(f*0.4))*5} fill="#4C3DB5" opacity="0.6"/>}
        <circle cx="100" cy="112" r="3" fill="#6C5CE7" opacity="0.5"/>
        {celebrating&&[[-30,-20],[30,-15],[-20,20],[35,10]].map(([dx,dy],i)=>(
          <text key={i} x={100+dx} y={80+dy} fontSize="12" textAnchor="middle" opacity={0.5+Math.abs(Math.sin(f*0.2+i))*0.5}>✨</text>
        ))}
        {listening&&[1,2,3].map(i=>(
          <circle key={i} cx="155" cy="95" r={8+i*8} fill="none" stroke="#00C48C" strokeWidth="1.5" opacity={0.4-i*0.1}/>
        ))}
      </svg>
    </div>
  );
};

// ── Synced bubble ─────────────────────────────────────────────────────────────
const SyncedBubble = ({text, talking=false, style={}}) => {
  const words = text.split(" ");
  const [hi, setHi] = useState(-1);
  useEffect(()=>{
    if(!talking){setHi(-1);return;}
    let idx=0;
    const avg=(text.length/14)*1000/words.length;
    const t=setInterval(()=>{setHi(idx);idx++;if(idx>=words.length)clearInterval(t);},avg);
    return()=>clearInterval(t);
  },[talking,text]);
  return (
    <div style={{background:"rgba(255,255,255,0.96)",backdropFilter:"blur(20px)",borderRadius:24,padding:"16px 22px",boxShadow:"0 8px 40px rgba(108,92,231,0.18)",border:"1.5px solid rgba(196,181,253,0.4)",maxWidth:420,lineHeight:1.9,...style}}>
      {words.map((w,i)=>(
        <span key={i} style={{display:"inline-block",marginRight:5,padding:"0 2px",borderRadius:5,background:i===hi?"#EEE8FF":"transparent",color:i===hi?"#6C5CE7":"#3B2D8A",fontWeight:i===hi?700:400,fontSize:16,transition:"all 0.12s",borderBottom:i===hi?"2px solid #6C5CE7":"2px solid transparent"}}>{w}</span>
      ))}
    </div>
  );
};

// ── Floating Kira widget ──────────────────────────────────────────────────────
const FloatingKira = ({text, talking, listening, mood="neutral", minimized, onToggle}) => (
  <div style={{position:"fixed",bottom:24,right:24,zIndex:100,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:10,fontFamily:"-apple-system,sans-serif"}}>
    {!minimized&&text&&(
      <div style={{animation:"fadeUp 0.3s ease",position:"relative"}}>
        <div style={{position:"absolute",bottom:-8,right:52,width:0,height:0,borderLeft:"10px solid transparent",borderRight:"10px solid transparent",borderTop:"10px solid rgba(255,255,255,0.96)"}}/>
        <SyncedBubble text={text} talking={talking} style={{maxWidth:280,fontSize:14}}/>
      </div>
    )}
    <div onClick={onToggle} style={{width:minimized?56:120,height:minimized?56:130,borderRadius:minimized?"50%":28,background:"linear-gradient(145deg,#DDD8FF,#EEE8FF)",boxShadow:"0 8px 32px rgba(108,92,231,0.25)",cursor:"pointer",overflow:"visible",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.3s cubic-bezier(0.34,1.56,0.64,1)",position:"relative",border:"2px solid rgba(196,181,253,0.5)"}}>
      {minimized
        ? <KiraAvatar size={36} talking={talking} listening={listening}/>
        : <div style={{transform:"scale(0.62)",transformOrigin:"center",marginTop:8}}>
            <KiraCharacter size={160} mood={mood} talking={talking} listening={listening}/>
          </div>
      }
      <div style={{position:"absolute",top:minimized?2:6,right:minimized?2:6,width:10,height:10,borderRadius:"50%",background:talking?"#6C5CE7":listening?"#00C48C":"#D1D5DB",border:"2px solid #fff"}}/>
    </div>
  </div>
);

// ── KiraAvatar (small, for sidebar + bubbles) ─────────────────────────────────
const KiraAvatar = ({ size=40, talking=false, listening=false, celebrating=false }) => {
  const [f, setF] = useState(0);
  useEffect(()=>{
    if(!talking&&!listening&&!celebrating) return;
    const t=setInterval(()=>setF(x=>x+1),60);
    return()=>clearInterval(t);
  },[talking,listening,celebrating]);
  const r=size/2, cx=r, cy=r;
  const bounce = celebrating ? Math.abs(Math.sin(f*.15))*size*.06 : 0;
  const pulse = (talking||listening) ? 0.93+Math.sin(f*.25)*.05 : 1;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{display:"block",overflow:"visible",transform:`translateY(${-bounce}px) scale(${pulse})`,transition:"transform .05s",transformOrigin:"center"}}>
      {(talking||listening)&&<circle cx={cx} cy={cy} r={r*1.18} fill="none" stroke="#C4B5FD" strokeWidth={size*.022} opacity={.3} style={{animation:"pulseRing 1.6s ease-in-out infinite"}}/>}
      <defs><linearGradient id={`g${size}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#9B8FEE"/><stop offset="100%" stopColor="#6C5CE7"/></linearGradient></defs>
      <circle cx={cx} cy={cy} r={r} fill={`url(#g${size})`}/>
      <ellipse cx={cx} cy={cy-r*.42} rx={r*.72} ry={r*.36} fill="#7B6FD8" opacity={.5}/>
      <text x={cx} y={cy-r*.08} textAnchor="middle" dominantBaseline="middle" fontFamily="-apple-system,sans-serif" fontWeight="800" fontSize={r*.52} fill="#fff" opacity={.96} letterSpacing={r*.04}>KIRA</text>
      <text x={cx} y={cy+r*.36} textAnchor="middle" dominantBaseline="middle" fontFamily="-apple-system,sans-serif" fontWeight="500" fontSize={r*.28} fill="#fff" opacity={.65} letterSpacing={r*.06}>AI</text>
      {talking&&(
        <g transform={`translate(${cx} ${cy+r*.62})`}>
          {[-3,-1.5,0,1.5,3].map((x,i)=>(
            <rect key={i} x={x*r*.09-r*.025} y={0} width={r*.05} height={r*.12*(0.5+Math.abs(Math.sin(f/3+i*.7))*.5)} rx={r*.025} fill="#fff" opacity={.7}/>
          ))}
        </g>
      )}
      <circle cx={cx+r*.66} cy={cy+r*.66} r={r*.16} fill="#00C48C" stroke="#fff" strokeWidth={size*.025}/>
    </svg>
  );
};

// ── Star Rating ───────────────────────────────────────────────────────────────
const StarRating = ({ sIdx }) => {
  const configs = [
    { stars:3, label:"You said it.", color:"#F59E0B" },
    { stars:2, label:"You got through it.", color:"#F59E0B" },
    { stars:1, label:"You kept going.", color:"#F59E0B" },
  ];
  const cfg = configs[sIdx % 3];
  const [visible, setVisible] = useState(false);
  useEffect(()=>{ const t = setTimeout(()=>setVisible(true), 60); return ()=>clearTimeout(t); }, []);
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"6px 0"}}>
      <div style={{display:"flex",gap:5}}>
        {[0,1,2].map(i=>(
          <svg key={i} width="32" height="32" viewBox="0 0 24 24"
            style={{transform:visible?"scale(1)":"scale(0)",transition:`transform .35s cubic-bezier(.34,1.56,.64,1) ${i*90}ms`,filter:i<cfg.stars?`drop-shadow(0 0 5px ${cfg.color}99)`:"none"}}>
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
              fill={i<cfg.stars?cfg.color:"#EDE9FF"} stroke={i<cfg.stars?cfg.color:"#C4B5FD"} strokeWidth="1"/>
          </svg>
        ))}
      </div>
      <div style={{fontSize:13,fontWeight:700,color:cfg.color,opacity:visible?1:0,transition:"opacity .3s .2s"}}>{cfg.label}</div>
    </div>
  );
};

// ── Shell ─────────────────────────────────────────────────────────────────────
const Shell = ({children, progress=0, stage="", kiraText="", kiraTalking=false, kiraListening=false, kiraMood="neutral"}) => {
  const [kiraMin, setKiraMin] = useState(false);
  const [navAnim, setNavAnim] = useState("idle");
  const [navF, setNavF] = useState(0);
  const navRef = useRef();
  useEffect(()=>{
    if(navAnim==="idle") return;
    navRef.current=setInterval(()=>setNavF(x=>x+1),50);
    const t=setTimeout(()=>{setNavAnim("idle");setNavF(0);clearInterval(navRef.current);},navAnim==="spin"?800:1200);
    return()=>{clearTimeout(t);clearInterval(navRef.current);};
  },[navAnim]);
  const navT = navAnim==="spin"?`rotate(${navF*18}deg)`:navAnim==="bounce"?`translateY(${Math.abs(Math.sin(navF*.35))*-8}px)`:navAnim==="wave"?`rotate(${Math.sin(navF*.4)*25}deg)`:"none";
  return (
    <div style={{height:"100vh",background:"#F6F4FF",fontFamily:"inherit",position:"relative"}}>
      <div style={{position:"fixed",top:0,left:0,right:0,height:52,background:"rgba(255,255,255,0.9)",backdropFilter:"blur(12px)",borderBottom:"1px solid #EDE9FF",zIndex:50,display:"flex",alignItems:"center",padding:"0 20px",gap:12}}>
        <div onClick={()=>{if(navAnim!=="idle")return;const a=["wave","spin","bounce"];setNavAnim(a[Math.floor(Math.random()*a.length)]);}}
          style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
          <div style={{transform:navT,transformOrigin:"center",transition:navAnim==="idle"?"transform .3s":"none",width:34,height:34,borderRadius:"50%",overflow:"hidden",background:"linear-gradient(145deg,#DDD8FF,#EEE8FF)",flexShrink:0,display:"flex",alignItems:"flex-start",justifyContent:"center"}}>
            <div style={{marginTop:-2}}>
              <KiraCharacter size={56} mood="neutral" talking={kiraTalking} listening={kiraListening}/>
            </div>
          </div>
          <span style={{fontSize:13,fontWeight:700,color:"#3B2D8A"}}>Kira</span>
          <span style={{width:6,height:6,borderRadius:"50%",background:"#00C48C",display:"inline-block"}}/>
        </div>
        <div style={{flex:1,height:3,background:"#EDE9FF",borderRadius:99,overflow:"hidden"}}>
          <div style={{height:"100%",width:progress+"%",background:"linear-gradient(90deg,#9B8FEE,#6C5CE7)",borderRadius:99,transition:"width .5s"}}/>
        </div>
        <div style={{fontSize:12,fontWeight:600,color:"#9B8FEE"}}>{stage}</div>
      </div>
      <div style={{paddingTop:52,height:"100%",overflowY:"auto"}}>{children}</div>
      <FloatingKira text={kiraText} talking={kiraTalking} listening={kiraListening} mood={kiraMood} minimized={kiraMin} onToggle={()=>setKiraMin(m=>!m)}/>
    </div>
  );
};

// ── Shared components ─────────────────────────────────────────────────────────
const KiraBubble = ({text, talking=false}) => (
  <div style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:10,animation:"fadeUp .25s ease"}}>
    <KiraAvatar size={28} talking={talking}/>
    <div style={{background:"#EEE8FF",borderRadius:"3px 14px 14px 14px",padding:"9px 13px",fontSize:13,color:"#3B2D8A",lineHeight:1.55,maxWidth:165}}>{text}</div>
  </div>
);

const PrimaryBtn = ({children, onClick, disabled, style={}}) => (
  <button onClick={disabled?undefined:onClick} style={{background:disabled?"#EDE9FF":"linear-gradient(135deg,#7B6FD8,#6C5CE7)",border:"none",borderRadius:14,padding:"14px 28px",fontSize:14,fontWeight:700,color:disabled?"#B0A8D8":"#fff",cursor:disabled?"default":"pointer",boxShadow:disabled?"none":"0 6px 20px rgba(108,92,231,.3)",transition:"all .2s",...style}}>{children}</button>
);

const AudioWaveBtn = ({text, label="Listen"}) => {
  const [playing,setPlaying]=useState(false);
  const [f,setF]=useState(0);
  const ref=useRef();
  const handle=()=>{
    if(playing){stopSpeech();setPlaying(false);clearInterval(ref.current);return;}
    setPlaying(true);
    ref.current=setInterval(()=>setF(x=>x+1),60);
    speak(text,()=>{setPlaying(false);clearInterval(ref.current);});
  };
  useEffect(()=>()=>clearInterval(ref.current),[]);
  const bars=[.4,.7,1,.85,.6,.9,.5,.75,.95,.55,.8,.45];
  return (
    <button onClick={handle} style={{display:"inline-flex",alignItems:"center",gap:8,background:playing?"#EEE8FF":"#F5F3FF",border:`1.5px solid ${playing?"#6C5CE7":"#C4B5FD"}`,borderRadius:99,padding:"7px 14px",cursor:"pointer",transition:"all .2s",outline:"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:2,height:18}}>
        {bars.map((h,i)=><div key={i} style={{width:3,borderRadius:99,background:playing?"#6C5CE7":"#C4B5FD",height:playing?4+Math.abs(Math.sin(f/3+i*.55))*13*h:3+h*6,transition:playing?"height .07s":"height .3s"}}/>)}
      </div>
      <span style={{fontSize:12,fontWeight:600,color:playing?"#6C5CE7":"#9B8FEE"}}>{playing?"Playing...":label}</span>
    </button>
  );
};

const SENTENCES_FOR_CLICK = ["A caterpillar crawled slowly along a branch.","It found a safe spot and began to spin a chrysalis around itself.","Inside the chrysalis, something amazing happened.","The caterpillar changed.","Days later, a beautiful butterfly pushed its way out and flew into the bright blue sky."];
const ClickableSentences = () => {
  const [active,setActive]=useState(null);
  const click=(i,t)=>{stopSpeech();setActive(i);speak(t,()=>setActive(null));};
  return (
    <div style={{fontSize:15,lineHeight:2.2,color:"#3B2D8A",wordSpacing:3,textAlign:"left"}}>
      {SENTENCES_FOR_CLICK.map((s,i)=>(
        <span key={i} onClick={()=>click(i,s)} style={{padding:"2px 4px",borderRadius:6,background:active===i?"#EEE8FF":"transparent",cursor:"pointer",borderBottom:active===i?"2px solid #6C5CE7":"2px solid transparent",transition:"background .15s"}}
          onMouseEnter={e=>{if(active!==i)e.currentTarget.style.background="#F5F3FF";}}
          onMouseLeave={e=>{if(active!==i)e.currentTarget.style.background="transparent";}}>
          {active===i&&<span style={{fontSize:11,marginRight:4}}>🔊</span>}{s}{" "}
        </span>
      ))}
    </div>
  );
};

// ── Passage Audio + Clickable for Comp ───────────────────────────────────────
const PassageAudioBtn = ({text}) => {
  const [playing,setPlaying]=useState(false);
  const [f,setF]=useState(0);
  const ref=useRef();
  const toggle=()=>{
    if(playing){stopSpeech();setPlaying(false);clearInterval(ref.current);return;}
    setPlaying(true);
    ref.current=setInterval(()=>setF(x=>x+1),60);
    speak(text,()=>{setPlaying(false);clearInterval(ref.current);});
  };
  useEffect(()=>()=>clearInterval(ref.current),[]);
  const bars=[.5,.9,.6,1,.7,.85,.5];
  return (
    <button onClick={toggle} style={{display:"flex",alignItems:"center",gap:5,background:playing?"#EEE8FF":"#F5F3FF",border:`1.5px solid ${playing?"#6C5CE7":"#C4B5FD"}`,borderRadius:99,padding:"4px 10px",cursor:"pointer",outline:"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:1.5,height:14}}>
        {bars.map((h,i)=><div key={i} style={{width:2.5,borderRadius:99,background:playing?"#6C5CE7":"#C4B5FD",height:playing?3+Math.abs(Math.sin(f/3+i*.6))*10*h:2+h*5,transition:playing?"height .07s":"height .3s"}}/>)}
      </div>
      <span style={{fontSize:11,fontWeight:600,color:playing?"#6C5CE7":"#9B8FEE"}}>{playing?"Stop":"▶ Play"}</span>
    </button>
  );
};

const PASSAGE_SENTENCES = [
  {text:"A caterpillar crawled slowly along a branch.",start:0,end:44},
  {text:"It found a safe spot and began to spin a chrysalis around itself.",start:45,end:110},
  {text:"Inside the chrysalis, something amazing happened.",start:111,end:160},
  {text:"The caterpillar changed.",start:161,end:185},
  {text:"Days later, a beautiful butterfly pushed its way out and flew into the bright blue sky.",start:186,end:272},
];
const ClickablePassage = ({highlight, hintStart, hintEnd}) => {
  const [active,setActive]=useState(null);
  const click=(i,text)=>{stopSpeech();if(active===i){setActive(null);return;}setActive(i);speak(text,()=>setActive(null));};
  return (
    <div style={{fontSize:15,lineHeight:2.2,color:"#4A4070"}}>
      <div style={{fontSize:10,color:"#C4B5FD",marginBottom:8,fontStyle:"italic"}}>Tap any sentence to hear it</div>
      {PASSAGE_SENTENCES.map((s,i)=>{
        const isHint=highlight&&s.start<=hintEnd&&s.end>=hintStart;
        const isActive=active===i;
        return (
          <span key={i} onClick={()=>click(i,s.text)}
            style={{display:"inline",background:isActive?"#EEE8FF":isHint?"#FEF08A":"transparent",borderRadius:5,borderBottom:isActive?"2px solid #6C5CE7":isHint?"2px solid #FDE68A":"2px solid transparent",color:isActive?"#6C5CE7":"#4A4070",fontWeight:isActive?600:400,cursor:"pointer",padding:"1px 2px",transition:"all .15s",lineHeight:2.1}}
            onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background=isHint?"#FEF08A":"#F5F3FF";}}
            onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background=isHint?"#FEF08A":"transparent";}}>
            {isActive&&<span style={{fontSize:10,marginRight:3}}>🔊</span>}{s.text}{" "}
          </span>
        );
      })}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 0 — Intro
// ══════════════════════════════════════════════════════════════════════════════
const PageIntro = ({onNext}) => {
  const [talking,setTalking]=useState(false);
  const [ready,setReady]=useState(false);
  const SCRIPT = "Hi! I'm Kira, your reading buddy. Today's story is about something that completely changes. I wonder — have you ever felt like you were turning into a different version of yourself?";
  useEffect(()=>{
    const go=()=>{setTalking(true);speak(SCRIPT,()=>{setTalking(false);setReady(true);});};
    window.speechSynthesis.getVoices().length>0?setTimeout(go,600):(window.speechSynthesis.onvoiceschanged=()=>setTimeout(go,600));
    return()=>stopSpeech();
  },[]);
  return (
    <div style={{display:"flex",height:"100vh",alignItems:"center",justifyContent:"center",background:"linear-gradient(145deg,#EDEAFF,#F8F6FF)",position:"relative",overflow:"hidden"}}>
      {[...Array(5)].map((_,i)=>(
        <div key={i} style={{position:"absolute",width:200+i*120,height:200+i*120,borderRadius:"50%",border:"1px solid rgba(108,92,231,0.07)",top:"50%",left:"50%",transform:"translate(-50%,-50%)",pointerEvents:"none"}}/>
      ))}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:0,position:"relative",zIndex:1}}>
        <KiraCharacter size={200} mood={ready?"happy":"neutral"} talking={talking} celebrating={ready}/>
        <div style={{marginTop:-16,animation:"fadeUp .4s ease",opacity:1,position:"relative"}}>
          <div style={{position:"absolute",top:-9,left:"50%",transform:"translateX(-50%)",width:0,height:0,borderLeft:"9px solid transparent",borderRight:"9px solid transparent",borderBottom:"9px solid rgba(255,255,255,0.96)"}}/>
          <SyncedBubble text={SCRIPT} talking={talking} style={{maxWidth:360,textAlign:"center",fontSize:15}}/>
        </div>
        <div style={{marginTop:16,display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.7)",backdropFilter:"blur(10px)",borderRadius:99,padding:"6px 18px",border:"1px solid rgba(196,181,253,0.3)"}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:"#00C48C",display:"inline-block"}}/>
          <span style={{fontSize:13,fontWeight:700,color:"#3B2D8A"}}>Kira</span>
          <span style={{fontSize:12,color:"#9B8FEE"}}>· Reading Buddy</span>
        </div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap",justifyContent:"center",marginTop:14,maxWidth:360}}>
          {["📚 Loves stories","🔭 Always curious","🤫 Good listener","✨ Finds magic in words"].map((t,i)=>(
            <span key={i} style={{fontSize:11,background:"rgba(255,255,255,0.8)",border:"1.5px solid #D8D0FF",borderRadius:99,padding:"5px 12px",color:"#4B3DB5",fontWeight:500}}>{t}</span>
          ))}
        </div>
        {ready&&(
          <button onClick={()=>{stopSpeech();onNext();}} style={{marginTop:22,background:"linear-gradient(135deg,#7B6FD8,#6C5CE7)",border:"none",borderRadius:99,padding:"16px 48px",fontSize:16,fontWeight:700,color:"#fff",cursor:"pointer",boxShadow:"0 8px 28px rgba(108,92,231,0.4)",animation:"fadeUp .4s ease",display:"flex",alignItems:"center",gap:10}}>
            Let's go! 🚀
          </button>
        )}
        {!ready&&(
          <div style={{marginTop:22,fontSize:13,color:"#9B8FEE",fontWeight:500}}>Kira is saying hi...</div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 1 — Warm-up
// ══════════════════════════════════════════════════════════════════════════════
const PageWarmup = ({onNext}) => {
  const [idx,setIdx]=useState(0);
  const [talking,setTalking]=useState(false);
  const [canProceed,setCanProceed]=useState(false);
  const w=HARD_WORDS[idx],isLast=idx===HARD_WORDS.length-1;
  const playWord=useCallback(()=>{
    setTalking(true);setCanProceed(false);
    const line=idx===0?"These words are a little tricky. Let me read them for you first. Chrysalis. That's chrys — A — lis.":"Next word — caterpillar. Cat — er — PIL — lar.";
    speak(line,()=>{setTalking(false);setCanProceed(true);});
  },[idx]);
  useEffect(()=>{setTimeout(playWord,400);return()=>stopSpeech();},[idx]);
  return (
    <Shell progress={16} stage="Warm-up" kiraText={talking?"Let me read this word for you...":"Tap 🔊 to hear it again!"} kiraTalking={talking}>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 48px"}}>
        <div style={{display:"flex",gap:8,marginBottom:24}}>{HARD_WORDS.map((_,i)=><span key={i} style={{width:i===idx?28:10,height:10,borderRadius:99,background:i<idx?"#6C5CE7":i===idx?"#6C5CE7":"#EDE9FF",transition:"all .3s"}}/>)}</div>
        <div style={{width:"100%",maxWidth:500,background:"#fff",borderRadius:24,boxShadow:"0 8px 32px rgba(108,92,231,.1)",padding:"36px 40px"}}>
          <div style={{display:"inline-flex",background:"#F2EFFF",borderRadius:12,padding:"6px 14px",marginBottom:18}}><span style={{fontSize:11,fontWeight:700,color:"#6C5CE7",letterSpacing:1.5}}>WORD TO KNOW</span></div>
          <div style={{fontSize:40,fontWeight:900,color:"#3B2D8A",marginBottom:6,textAlign:"center"}}>{w.word}</div>
          <div style={{fontSize:13,color:"#9B8FEE",letterSpacing:3,marginBottom:20,textAlign:"center",fontWeight:500}}>{w.syl}</div>
          <div style={{height:1,background:"#EDE9FF",marginBottom:18}}/>
          <div style={{fontSize:15,color:"#4A4070",lineHeight:1.7,marginBottom:18,textAlign:"center"}}>→ {w.def}</div>
          <div style={{background:"#FFF9EC",border:"1.5px solid #FDE68A",borderRadius:12,padding:"11px 14px",marginBottom:20,display:"flex",gap:8,alignItems:"flex-start"}}>
            <span style={{fontSize:15,flexShrink:0}}>💡</span>
            <span style={{fontSize:13,color:"#78350F",lineHeight:1.6}}>{w.hint}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
            <button onClick={playWord} style={{background:"#F2EFFF",color:talking?"#aaa":"#6C5CE7",border:"2px solid #C4B5FD",borderRadius:99,padding:"10px 24px",fontSize:13,fontWeight:600,cursor:talking?"default":"pointer",display:"inline-flex",alignItems:"center",gap:8}}>
              {talking?"🔊 Playing...":"🔊 Tap to hear"}
            </button>
            {canProceed&&<div style={{fontSize:11,color:"#B0A8D8"}}>Tap as many times as you like</div>}
          </div>
        </div>
        <div style={{display:"flex",gap:12,marginTop:20}}>
          <button onClick={()=>{stopSpeech();setIdx(i=>Math.max(0,i-1));}} disabled={idx===0} style={{background:"#fff",border:"1.5px solid #EDE9FF",borderRadius:12,padding:"10px 20px",fontSize:13,fontWeight:500,color:idx===0?"#C4B5FD":"#4A4070",cursor:idx===0?"default":"pointer"}}>← Back</button>
          <PrimaryBtn onClick={()=>{stopSpeech();isLast?onNext():setIdx(i=>i+1);}} disabled={!canProceed}>{isLast?"Continue →":"Next →"}</PrimaryBtn>
        </div>
      </div>
    </Shell>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 2 — Echo Reading
// ══════════════════════════════════════════════════════════════════════════════
const PageEcho = ({onNext}) => {
  const [sIdx,setSIdx]=useState(0);
  const [phase,setPhase]=useState("kira_reading");
  const [secs,setSecs]=useState(0);
  const [f,setF]=useState(0);
  const tr=useRef(),ar=useRef();
  const isLast=sIdx===ECHO_SENTENCES.length-1;

  useEffect(()=>{
    setPhase("kira_reading");
    speak(ECHO_SENTENCES[sIdx],()=>setPhase("student_turn"));
    return()=>stopSpeech();
  },[sIdx]);

  // done_sentence 自动推进
  useEffect(()=>{
    if(phase!=="done_sentence") return;
    if(!isLast){
      const t=setTimeout(()=>{ setSIdx(i=>i+1); setSecs(0); }, 3200);
      return()=>clearTimeout(t);
    } else {
      // 最后一句：星星展示 2.2s 后直接跳过渡页
      const t=setTimeout(()=>{ stopSpeech(); onNext(); }, 2200);
      return()=>clearTimeout(t);
    }
  },[phase, isLast, onNext]);

  const startRec=()=>{
    setPhase("recording"); setSecs(0);
    tr.current=setInterval(()=>setSecs(s=>s+1),1000);
    ar.current=setInterval(()=>setF(x=>x+1),80);
    setTimeout(()=>stopRec(),6000);
  };
  const stopRec=()=>{ clearInterval(tr.current); clearInterval(ar.current); setPhase("done_sentence"); };
  useEffect(()=>()=>{ clearInterval(tr.current); clearInterval(ar.current); stopSpeech(); },[]);

  const echoKiraText = phase==="kira_reading"?ECHO_SENTENCES[sIdx]:phase==="student_turn"?"Your turn — repeat!":phase==="recording"?"I'm listening 👂":phase==="done_sentence"&&isLast?"You did it! 🎉":"";

  return (
    <Shell progress={32} stage="Echo Reading" kiraText={echoKiraText} kiraTalking={phase==="kira_reading"} kiraListening={phase==="student_turn"||phase==="recording"}>
      <div style={{padding:"20px 40px 0",display:"flex",alignItems:"center",gap:12}}>
        <div style={{fontSize:10,fontWeight:700,color:"#B0A8D8",letterSpacing:1.5}}>ECHO READING — LISTEN THEN REPEAT</div>
        <div style={{flex:1}}/>
        <div style={{display:"flex",gap:4}}>
          {ECHO_SENTENCES.map((_,i)=><span key={i} style={{width:8,height:8,borderRadius:"50%",background:i<sIdx?"#6C5CE7":i===sIdx?"#9B8FEE":"#EDE9FF",transition:"background .2s"}}/>)}
        </div>
      </div>
      <div style={{flex:1,display:"flex",justifyContent:"center",padding:"20px 40px 0"}}>
        <div style={{width:"100%",maxWidth:540,display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:phase==="kira_reading"?"#F2EFFF":"#FAFAFE",border:`1.5px solid ${phase==="kira_reading"?"#6C5CE7":"#EDE9FF"}`,borderRadius:16,padding:"18px 22px",transition:"all .3s"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#B0A8D8",letterSpacing:1,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
              <KiraAvatar size={16}/> KIRA READS
              {phase==="kira_reading"&&<div style={{display:"flex",gap:2,marginLeft:4}}>{[.5,1,.7,1,.6].map((h,i)=><div key={i} style={{width:3,height:4+h*8,borderRadius:99,background:"#6C5CE7"}}/>)}</div>}
            </div>
            <p style={{margin:0,fontSize:19,color:"#3B2D8A",lineHeight:1.7,fontWeight:500,textAlign:"left"}}>{ECHO_SENTENCES[sIdx]}</p>
            <button onClick={()=>{stopSpeech();setPhase("kira_reading");speak(ECHO_SENTENCES[sIdx],()=>setPhase("student_turn"));}}
              style={{marginTop:10,background:"none",border:"none",fontSize:12,color:"#9B8FEE",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:4}}>🔊 Hear again</button>
          </div>

          <div style={{background:(phase==="student_turn"||phase==="recording")?"#F0FDF8":"#FAFAFE",border:`1.5px solid ${(phase==="student_turn"||phase==="recording")?"#00C48C":"#EDE9FF"}`,borderRadius:16,padding:"18px 22px",opacity:phase==="kira_reading"?.4:1,transition:"all .3s"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#B0A8D8",letterSpacing:1,marginBottom:12}}>YOUR TURN</div>
            {phase==="student_turn"&&(
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
                <p style={{margin:0,fontSize:14,color:"#9B8FEE",textAlign:"center",fontStyle:"italic"}}>Repeat the same sentence</p>
                <button onClick={startRec} style={{width:54,height:54,borderRadius:"50%",background:"linear-gradient(135deg,#00C48C,#00A878)",border:"none",fontSize:22,cursor:"pointer",color:"#fff",boxShadow:"0 4px 16px rgba(0,196,140,.35)",display:"flex",alignItems:"center",justifyContent:"center"}}>🎤</button>
                <span style={{fontSize:12,color:"#B0A8D8"}}>Tap to repeat</span>
              </div>
            )}
            {phase==="recording"&&(
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
                <div style={{display:"flex",gap:3,alignItems:"center"}}>
                  {[.5,1,.7,1.2,.6,.9,.4].map((h,i)=><div key={i} style={{width:4,borderRadius:99,background:"#00C48C",height:6+Math.abs(Math.sin(f/3+i*.9))*14*h,transition:"height .08s"}}/>)}
                </div>
                <div style={{fontSize:13,color:"#00C48C",fontWeight:700}}>Recording... {secs}s</div>
                <button onClick={stopRec} style={{background:"#F0FDF8",border:"1.5px solid #6EE7B7",borderRadius:99,padding:"7px 18px",fontSize:12,color:"#059669",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Done ✓</button>
              </div>
            )}
            {phase==="done_sentence"&&<StarRating key={sIdx} sIdx={sIdx}/>}
            {phase==="kira_reading"&&<div style={{fontSize:13,color:"#C4B5FD",textAlign:"center"}}>Listen first...</div>}
          </div>

          {/* skip：最后一句直接跳过渡页，其他句跳下一句 */}
          {phase==="student_turn"&&(
            <div style={{textAlign:"center"}}>
              <button onClick={()=>{ stopSpeech(); if(isLast){ onNext(); } else { setSIdx(i=>i+1); setSecs(0); } }}
                style={{background:"none",border:"none",fontSize:12,color:"#C4B5FD",cursor:"pointer",textDecoration:"underline",textUnderlineOffset:2}}>skip →</button>
            </div>
          )}
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"center",padding:"20px 0 28px"}}>
        <div style={{fontSize:12,color:"#C4B5FD"}}>Listen to Kira, then repeat each sentence</div>
      </div>
    </Shell>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 3 — Guided Reading
// ══════════════════════════════════════════════════════════════════════════════
const PageGuided = ({onNext}) => {
  const [rec,setRec]=useState(false);
  const [timer,setTimer]=useState(60);
  const [wIdx,setWIdx]=useState(-1);       // 学生朗读时的高亮词
  const [previewIdx,setPreviewIdx]=useState(-1); // "Hear it first" 播放时的高亮词
  const [kiraMsg,setKiraMsg]=useState(null);
  const [done,setDone]=useState(false);
  const [f,setF]=useState(0);
  const [kiraTalking,setKiraTalking]=useState(false);
  const [previewing,setPreviewing]=useState(false); // 正在预览朗读
  const tr=useRef(),wr=useRef(),ar=useRef(),pr=useRef();

  useEffect(()=>{setKiraTalking(true);speak("Let's start reading! Tap the mic when you're ready.",()=>setKiraTalking(false));return()=>stopSpeech();},[]);

  const [completedReading,setCompletedReading]=useState(false);
  const finish=useCallback((timedOut=false)=>{setDone(true);setRec(false);setCompletedReading(!timedOut);clearInterval(tr.current);clearInterval(wr.current);},[]);

  // 预览朗读：Kira 嘴巴动 + 段落按词高亮
  const handlePreview=()=>{
    if(previewing){
      stopSpeech();
      setPreviewing(false);setKiraTalking(false);
      setPreviewIdx(-1);clearInterval(pr.current);
      return;
    }
    setPreviewing(true);setKiraTalking(true);setPreviewIdx(0);
    // 按平均字速推进高亮，和语音大致同步
    const msPerWord = (WORDS.join(" ").length / 12) * 1000 / 0.92 / WORDS.length;
    let idx=0;
    pr.current=setInterval(()=>{
      idx++;
      if(idx>=WORDS.length){ clearInterval(pr.current); return; }
      setPreviewIdx(idx);
    }, msPerWord);
    speak(WORDS.join(" "),()=>{
      setPreviewing(false);setKiraTalking(false);
      setPreviewIdx(-1);clearInterval(pr.current);
    });
  };

  const start=()=>{
    stopSpeech();setPreviewing(false);setKiraTalking(false);
    clearInterval(pr.current);setPreviewIdx(-1);
    setRec(true);setWIdx(0);
    tr.current=setInterval(()=>setTimer(t=>{if(t<=1){finish(true);return 0;}return t-1;}),1000);
    wr.current=setInterval(()=>setWIdx(i=>{if(i>=WORDS.length-1){finish(false);return i;}return i+1;}),480);
    setTimeout(()=>{const m="Tricky word — chrys·A·lis. Keep going!";setKiraMsg(m);setKiraTalking(true);speak(m,()=>setKiraTalking(false));},7000);
  };
  useEffect(()=>{if(!rec&&!done&&!previewing)return;ar.current=setInterval(()=>setF(x=>x+1),80);return()=>clearInterval(ar.current);},[rec,done,previewing]);
  useEffect(()=>()=>{clearInterval(tr.current);clearInterval(wr.current);clearInterval(ar.current);clearInterval(pr.current);},[]);

  // 当前高亮词：预览用 previewIdx，录音用 wIdx
  const activeIdx = previewing ? previewIdx : wIdx;

  const guidedKiraMsg = previewing?"Reading along with you...":kiraTalking?"Kira is speaking...":!rec&&!done?"Tap mic to start reading":rec&&!kiraMsg?"I'm with you 👂":kiraMsg??"";
  return (
    <Shell progress={48} stage="Guided Reading" kiraText={guidedKiraMsg} kiraTalking={kiraTalking||previewing} kiraListening={rec&&!kiraTalking}>
      <div style={{padding:"20px 40px 0",display:"flex",alignItems:"center",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:7,background:"#fff",border:`1.5px solid ${rec?"#FFD0D0":"#EDE9FF"}`,borderRadius:99,padding:"6px 14px"}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:rec?"#FF4757":done?"#00C48C":"#D1D5DB",boxShadow:rec?"0 0 0 4px rgba(255,71,87,.18)":"none"}}/>
          <span style={{fontSize:12,fontWeight:700,color:rec?"#FF4757":done?"#00C48C":"#9CA3AF"}}>{rec?"REC":done?"DONE":"READY"}</span>
        </div>
        <div style={{background:"#fff",border:`1.5px solid ${timer<10?"#FFD0D0":"#EDE9FF"}`,borderRadius:99,padding:"6px 16px"}}>
          <span style={{fontSize:15,fontWeight:800,fontVariantNumeric:"tabular-nums",color:timer<10?"#FF4757":"#3B2D8A"}}>{Math.floor(timer/60)}:{String(timer%60).padStart(2,"0")}</span>
        </div>
        <div style={{flex:1}}/>
        <div style={{fontSize:12,color:"#B0A8D8",fontWeight:500}}>The Butterfly · Grade 3</div>
      </div>
      <div style={{flex:1,display:"flex",justifyContent:"center",padding:"20px 40px 0"}}>
        <div style={{width:"100%",maxWidth:540,background:"#fff",borderRadius:20,boxShadow:"0 4px 24px rgba(108,92,231,.08)",padding:"28px 36px",overflowY:"auto"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#B0A8D8",letterSpacing:1.5,marginBottom:16}}>THE BUTTERFLY · GRADE 3</div>
          <div style={{fontSize:20,lineHeight:2.5,wordSpacing:5,textAlign:"left"}}>
            {WORDS.map((w,i)=>{
              const isActive = i===activeIdx;
              const isDone   = activeIdx>=0 && i<activeIdx;
              return (
                <span key={i} style={{
                  padding:"1px 3px",borderRadius:5,
                  color: isActive?"#3B2D8A": isDone?"#1A1035":"#C4B5FD",
                  fontWeight: isActive?700:400,
                  background: isActive?(previewing?"#FFF3CD":"#EEE8FF"):"transparent",
                  borderBottom: isActive?`2.5px solid ${previewing?"#F59E0B":"#6C5CE7"}`:"2.5px solid transparent",
                  transition:"color .1s,background .1s",
                  boxShadow: isActive&&previewing?"0 0 0 3px rgba(245,158,11,0.15)":"none",
                }}>{w}{" "}</span>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"20px 0 28px",gap:8}}>
        {!rec&&!done&&(
          <>
            <div style={{display:"flex",gap:14,alignItems:"center"}}>
              {/* 替换原来的 AudioWaveBtn，改为有高亮联动的按钮 */}
              <button onClick={handlePreview} style={{display:"inline-flex",alignItems:"center",gap:8,background:previewing?"#EEE8FF":"#F5F3FF",border:`1.5px solid ${previewing?"#6C5CE7":"#C4B5FD"}`,borderRadius:99,padding:"7px 14px",cursor:"pointer",transition:"all .2s",outline:"none"}}>
                <div style={{display:"flex",alignItems:"center",gap:2,height:18}}>
                  {[.4,.7,1,.85,.6,.9,.5,.75,.95,.55,.8,.45].map((h,i)=><div key={i} style={{width:3,borderRadius:99,background:previewing?"#6C5CE7":"#C4B5FD",height:previewing?4+Math.abs(Math.sin(f/3+i*.55))*13*h:3+h*6,transition:previewing?"height .07s":"height .3s"}}/>)}
                </div>
                <span style={{fontSize:12,fontWeight:600,color:previewing?"#6C5CE7":"#9B8FEE"}}>{previewing?"Stop":"Hear it first"}</span>
              </button>
              <button onClick={start} disabled={kiraTalking} style={{width:62,height:62,borderRadius:"50%",background:kiraTalking?"#EDE9FF":"linear-gradient(135deg,#7B6FD8,#6C5CE7)",border:"none",fontSize:24,cursor:kiraTalking?"default":"pointer",boxShadow:kiraTalking?"none":"0 6px 24px rgba(108,92,231,.4)",color:kiraTalking?"#aaa":"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>🎤</button>
            </div>
            <span style={{fontSize:12,color:"#B0A8D8"}}>{kiraTalking?"Wait for Kira...":previewing?"Follow along ✨":"Hear it first, or tap mic to start"}</span>
          </>
        )}
        {rec&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
            <div style={{width:62,height:62,borderRadius:"50%",background:"#FF4757",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,color:"#fff",boxShadow:"0 0 0 10px rgba(255,71,87,.12)"}}>🎙</div>
            <span style={{fontSize:12,color:"#FF4757",fontWeight:600}}>Recording...</span>
            <button onClick={()=>{clearInterval(tr.current);clearInterval(wr.current);setRec(false);setTimer(60);setWIdx(-1);setKiraMsg(null);}} style={{marginTop:4,background:"none",border:"none",fontSize:11,color:"#C4B5FD",cursor:"pointer",textDecoration:"underline",textUnderlineOffset:2}}>↺ start over</button>
          </div>
        )}
        {done&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,animation:"fadeUp .4s ease"}}><div style={{fontSize:14,color:"#00C48C",fontWeight:600}}>Great job! 🎉</div><PrimaryBtn onClick={()=>onNext({completed:completedReading})}>Continue →</PrimaryBtn></div>}
      </div>
    </Shell>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 4 — Self Rating
// ══════════════════════════════════════════════════════════════════════════════
const PageRating = ({onNext, completed}) => {
  const [sel,setSel]=useState(null);
  const [kiraTalking,setKiraTalking]=useState(false);
  const [replyDone,setReplyDone]=useState(false);
  const [kiraMood,setKiraMood]=useState("neutral");
  const replies={easy:"Glad it felt good.",medium:"You kept going — that's what matters.",hard:"That's okay — tricky parts help you grow."};
  useEffect(()=>{setKiraTalking(true);speak("How did that feel? Just tap one.",()=>setKiraTalking(false));return()=>stopSpeech();},[]);
  const handleSel=(val)=>{
    if(sel)return;setSel(val);stopSpeech();setKiraTalking(true);
    if(val==="easy") setKiraMood("celebrating");
    else if(val==="hard") setKiraMood("cautious");
    else setKiraMood("neutral");
    speak(replies[val],()=>{setKiraTalking(false);setReplyDone(true);});
  };
  const opts=[{emoji:"😄",label:"That felt smooth",val:"easy"},{emoji:"😐",label:"A few tricky parts",val:"medium"},{emoji:"😓",label:"Really tough today",val:"hard"}];
  return (
    <Shell progress={64} stage="Self-rating" kiraText={sel?replies[sel]:"How did that feel? Just tap one."} kiraTalking={kiraTalking} kiraMood={kiraMood}>
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"40px 48px"}}>
        <div style={{width:"100%",maxWidth:460}}>
          <div style={{fontSize:11,fontWeight:700,color:"#B0A8D8",letterSpacing:1.5,marginBottom:6}}>HOW DID IT FEEL?</div>
          <div style={{fontSize:24,fontWeight:800,color:"#3B2D8A",marginBottom:24,lineHeight:1.2}}>Choose the one that fits best.</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {opts.map(o=>(
              <button key={o.val} onClick={()=>handleSel(o.val)} style={{display:"flex",alignItems:"center",gap:16,padding:"16px 20px",background:sel===o.val?"#F2EFFF":"#fff",border:`2px solid ${sel===o.val?"#6C5CE7":"#EDE9FF"}`,borderRadius:16,cursor:sel?"default":"pointer",fontFamily:"inherit",textAlign:"left",opacity:sel&&sel!==o.val?.5:1,transition:"all .15s"}}>
                <span style={{fontSize:28}}>{o.emoji}</span>
                <span style={{fontSize:15,fontWeight:sel===o.val?700:400,color:sel===o.val?"#3B2D8A":"#4A4070"}}>{o.label}</span>
                {sel===o.val&&<span style={{marginLeft:"auto",color:"#6C5CE7"}}>●</span>}
              </button>
            ))}
          </div>
          {replyDone&&<div style={{marginTop:20,animation:"fadeUp .3s ease"}}><PrimaryBtn onClick={()=>onNext(sel)} style={{width:"100%"}}>Continue →</PrimaryBtn></div>}
        </div>
      </div>
    </Shell>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 5 — Comprehension
// ══════════════════════════════════════════════════════════════════════════════
const PageComp = ({onNext}) => {
  const [qIdx,setQIdx]=useState(0);
  const [sel,setSel]=useState(null);
  const [attempt,setAttempt]=useState(0);
  const [revealed,setRevealed]=useState(false);
  const [showHintBtn,setShowHintBtn]=useState(false);
  const [highlight,setHighlight]=useState(false);
  const [showOpen,setShowOpen]=useState(false);
  const [kiraTalking,setKiraTalking]=useState(false);
  const [kiraText,setKiraText]=useState("");
  const [openReply,setOpenReply]=useState("");
  const [openDone,setOpenDone]=useState(false);  // ← FIX: was missing
  const q=COMP[qIdx],correct=sel===q.ans,isLast=qIdx===COMP.length-1;

  const say=(text,cb)=>{setKiraText(text);setKiraTalking(true);speak(text,()=>{setKiraTalking(false);cb?.();});};
  useEffect(()=>{say(`I wonder what you thought — ${COMP[0].q}`);return()=>stopSpeech();},[]);

  const submit=()=>{
    if(sel===null||kiraTalking)return;
    if(correct){
      if(isLast) setTimeout(()=>{say(OPEN_Q.question);setShowOpen(true);},500);
      else setTimeout(()=>{setQIdx(1);setSel(null);setAttempt(0);setRevealed(false);setHighlight(false);setShowHintBtn(false);setTimeout(()=>say(`I wonder — ${COMP[1].q}`),300);},700);
    } else if(attempt===0){
      setShowHintBtn(true);setHighlight(true);
      say("I see why you'd think that — the answer is somewhere in the story. Can you find it?",()=>{setAttempt(1);setSel(null);});
    } else {
      say(`The answer is "${q.opts[q.ans]}" — the story tells us right in the highlighted part.`);
      setRevealed(true);setHighlight(false);
    }
  };

  return (
    <Shell progress={78} stage="Comprehension" kiraText={kiraText||(showOpen?OPEN_Q.question:`I wonder — ${q.q}`)} kiraTalking={kiraTalking}>
      <div style={{padding:"20px 32px 28px",height:"100%",boxSizing:"border-box",display:"flex",flexDirection:"column"}}>
        {/* 整体卡片：故事 + 题目 包在一起 */}
        <div style={{flex:1,display:"flex",background:"#fff",borderRadius:20,boxShadow:"0 4px 32px rgba(108,92,231,.10)",border:"1.5px solid #EDE9FF",overflow:"hidden",minHeight:0}}>

          {/* 左侧：故事 */}
          <div style={{width:300,flexShrink:0,borderRight:"1.5px solid #EDE9FF",padding:"24px 20px",overflowY:"auto",display:"flex",flexDirection:"column",background:"#FAFAFE"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:700,color:"#B0A8D8",letterSpacing:1}}>THE STORY</div>
              <PassageAudioBtn text={PASSAGE_TEXT}/>
            </div>
            <ClickablePassage highlight={highlight} hintStart={q.hint_start} hintEnd={q.hint_end}/>
          </div>

          {/* 右侧：题目 */}
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"28px 32px",overflowY:"auto"}}>
            <div style={{width:"100%",maxWidth:400}}>
            {!showOpen&&(
              <>
                <div style={{display:"flex",gap:8,marginBottom:20}}>{COMP.map((_,i)=><div key={i} style={{flex:1,height:4,background:i<qIdx?"#6C5CE7":i===qIdx?"#C4B5FD":"#EDE9FF",borderRadius:99}}/>)}</div>
                {showHintBtn&&!highlight&&(
                  <button onClick={()=>{setHighlight(true);setShowHintBtn(false);}}
                    style={{display:"flex",alignItems:"center",gap:8,background:"#FFFBEB",border:"1.5px solid #FDE68A",borderRadius:10,padding:"9px 14px",marginBottom:14,fontSize:13,color:"#78350F",cursor:"pointer",fontFamily:"inherit",width:"100%",animation:"fadeUp .3s ease"}}>
                    <span>💡</span>
                    <span style={{fontWeight:600}}>Show me where in the story</span>
                  </button>
                )}
                {highlight&&<div style={{background:"#FFFBEB",border:"1.5px solid #FDE68A",borderRadius:10,padding:"9px 13px",marginBottom:14,fontSize:13,color:"#78350F",animation:"fadeUp .3s"}}>💡 Look at the highlighted part of the story →</div>}
                <div style={{fontSize:11,fontWeight:700,color:"#B0A8D8",letterSpacing:1.5,marginBottom:8}}>QUESTION {qIdx+1} OF {COMP.length}</div>
                <div style={{fontSize:18,fontWeight:700,color:"#3B2D8A",marginBottom:18,lineHeight:1.4}}>{q.q}</div>
                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:18}}>
                  {q.opts.map((opt,i)=>{
                    let bg="#fff",border="#EDE9FF",tc="#4A4070",fw=400,icon=null;
                    if(sel===i&&!revealed){bg="#F2EFFF";border="#6C5CE7";tc="#3B2D8A";fw=600;}
                    if(revealed&&i===q.ans){bg="#F0FDF8";border="#6EE7B7";tc="#065F46";fw=600;icon="✓";}
                    if(!revealed&&sel===i&&correct){bg="#F0FDF8";border="#6EE7B7";tc="#065F46";fw=600;icon="✓";}
                    return <button key={i} onClick={()=>!revealed&&!kiraTalking&&setSel(i)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:bg,border:`2px solid ${border}`,borderRadius:12,cursor:revealed||kiraTalking?"default":"pointer",fontFamily:"inherit",textAlign:"left",transition:"all .15s"}}>
                      <span style={{width:26,height:26,borderRadius:"50%",background:sel===i?"#6C5CE7":"#F2EFFF",color:sel===i?"#fff":"#6C5CE7",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{String.fromCharCode(65+i)}</span>
                      <span style={{fontSize:14,fontWeight:fw,color:tc,flex:1}}>{opt}</span>
                      {icon&&<span style={{color:"#059669",fontSize:15,fontWeight:700}}>{icon}</span>}
                    </button>;
                  })}
                </div>
                {!revealed&&<PrimaryBtn onClick={submit} disabled={sel===null||kiraTalking} style={{width:"100%"}}>{attempt===1?"Try again →":"Submit →"}</PrimaryBtn>}
                {revealed&&<PrimaryBtn onClick={()=>{
                  if(isLast){say(OPEN_Q.question);setShowOpen(true);}
                  else{setQIdx(1);setSel(null);setAttempt(0);setRevealed(false);setHighlight(false);setShowHintBtn(false);setTimeout(()=>say(`I wonder — ${COMP[1].q}`),300);}
                }} style={{width:"100%"}}>{isLast?"One more thing →":"Next →"}</PrimaryBtn>}
              </>
            )}
            {showOpen&&(
              <div style={{animation:"fadeUp .3s ease"}}>
                <div style={{display:"inline-flex",background:"#FFF9EC",border:"1.5px solid #FDE68A",borderRadius:12,padding:"6px 14px",marginBottom:14}}><span style={{fontSize:11,fontWeight:700,color:"#92400E",letterSpacing:1}}>KIRA IS CURIOUS 🔭</span></div>
                <div style={{fontSize:18,fontWeight:700,color:"#3B2D8A",marginBottom:20,lineHeight:1.5}}>{OPEN_Q.question}</div>
                {!openDone&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
                  {OPEN_Q.k2_opts.map((o,i)=><button key={i} onClick={()=>{
                    setOpenReply("...");
                    const context = `The child answered the question "Why do you think the caterpillar chose that branch?" with: "${o}"`;
                    callKiraAI(KIRA_SYSTEM_SPARK, context).then(aiReply => {
                      const reply = aiReply || KIRA_OPEN_REPLIES[Math.floor(Math.random()*KIRA_OPEN_REPLIES.length)];
                      setOpenReply(reply);
                      say(reply, ()=>setOpenDone(true));
                    });
                  }} style={{background:"#F2EFFF",border:"1.5px solid #C4B5FD",borderRadius:99,padding:"9px 16px",fontSize:13,color:"#4B3DB5",fontWeight:500,cursor:"pointer",fontFamily:"inherit"}}>{o}</button>)}
                </div>}
                {openDone&&<div style={{animation:"fadeUp .3s"}}><div style={{background:"#EEE8FF",borderRadius:16,padding:"16px 20px",marginBottom:16,display:"flex",gap:10,alignItems:"flex-start"}}><KiraAvatar size={36}/><p style={{margin:0,fontSize:15,color:"#3B2D8A",lineHeight:1.7,fontStyle:"italic"}}>"{openReply}"</p></div><PrimaryBtn onClick={onNext} style={{width:"100%"}}>See results →</PrimaryBtn></div>}
              </div>
            )}
          </div>{/* 右侧内容 maxWidth */}
          </div>{/* 右侧面板 */}
        </div>{/* 整体卡片 */}
      </div>{/* 外层 padding 容器 */}
    </Shell>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 6 — Results
// ══════════════════════════════════════════════════════════════════════════════
const PageResults = ({rating, completed, onRestart}) => {
  const key=`${rating}_${completed?'done':'timeout'}`;
  const starCount={easy_done:3,easy_timeout:2,medium_done:2,medium_timeout:1,hard_done:2,hard_timeout:1}[key]??1;
  const moodMap={easy_done:"happy",easy_timeout:"neutral",medium_done:"neutral",medium_timeout:"neutral",hard_done:"cautious",hard_timeout:"cautious"};

  const [phase,setPhase]=useState("celebrate");
  const [kiraTalking,setKiraTalking]=useState(false);
  const [starsVisible,setStarsVisible]=useState(false);
  const [f,setF]=useState(0);
  const [selectedWord,setSelectedWord]=useState(null);
  const [script,setScript]=useState("...");

  useEffect(()=>{
    const fallback=KIRA_SCRIPTS[key]||KIRA_SCRIPTS.medium_done;
    const context=`The child just finished reading a story called "The Butterfly".
Self-rating: ${rating} (easy/medium/hard scale).
Did they finish reading before the timer: ${completed?"yes":"no"}.
Generate Kira's closing reflection for this specific child right now.`;
    callKiraAI(KIRA_SYSTEM_MIRROR,context).then(aiReply=>{
      setScript(aiReply||fallback);
    });
  },[]);

  useEffect(()=>{
    if(script==="...")return;
    const a=setInterval(()=>setF(x=>x+1),60);
    setTimeout(()=>{
      clearInterval(a);setPhase("content");
      setTimeout(()=>setStarsVisible(true),300);
      setTimeout(()=>{setKiraTalking(true);speak(script,()=>setKiraTalking(false));},800);
    },2200);
    return()=>{clearInterval(a);stopSpeech();};
  },[]);

  if(phase==="celebrate") return (
    <div style={{display:"flex",height:"100vh",alignItems:"center",justifyContent:"center",background:"linear-gradient(145deg,#EDEAFF,#F8F6FF)",flexDirection:"column",gap:20,position:"relative",overflow:"hidden"}}>
      {Array.from({length:16}).map((_,i)=>(
        <div key={i} style={{position:"absolute",left:`${8+i*6}%`,top:`${-10+((f*2+i*20)%120)}%`,width:8,height:8,borderRadius:"50%",background:["#7B6FD8","#A78BFA","#FDE68A","#6EE7B7","#F9A8D4"][i%5],opacity:.8,transform:`rotate(${f*3+i*30}deg)`}}/>
      ))}
      <KiraAvatar size={140} celebrating={true}/>
      <div style={{fontSize:30,fontWeight:900,color:"#3B2D8A"}}>You finished!</div>
      <div style={{fontSize:15,color:"#9B8FEE",fontWeight:500}}>The Butterfly · Grade 3</div>
    </div>
  );

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",background:"#F6F4FF",overflow:"hidden"}}>

      {/* ── Hero zone ── */}
      <div style={{background:"linear-gradient(160deg,#5B4FD8 0%,#8B7FE8 100%)",padding:"32px 24px 40px",display:"flex",flexDirection:"column",alignItems:"center",gap:6,position:"relative",overflow:"hidden",flexShrink:0}}>
        {[100,170,240].map((r,i)=>(
          <div key={i} style={{position:"absolute",width:r*2,height:r*2,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.06)",top:"50%",left:"50%",transform:"translate(-50%,-50%)",pointerEvents:"none"}}/>
        ))}
        <KiraCharacter size={130} mood={moodMap[key]||"neutral"} talking={kiraTalking} celebrating={key==="easy_done"&&!kiraTalking}/>
        <div style={{display:"flex",gap:8,marginTop:-6}}>
          {[0,1,2].map(i=>(
            <svg key={i} width="36" height="36" viewBox="0 0 24 24"
              style={{transform:starsVisible&&i<starCount?"scale(1)":"scale(0)",transition:`transform .45s cubic-bezier(.34,1.56,.64,1) ${i*130}ms`,filter:i<starCount?"drop-shadow(0 0 8px rgba(253,230,138,0.85))":"none"}}>
              <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
                fill={i<starCount?"#FDE68A":"rgba(255,255,255,0.18)"}
                stroke={i<starCount?"#F59E0B":"rgba(255,255,255,0.12)"} strokeWidth="1.5"/>
            </svg>
          ))}
        </div>
        <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,0.72)",letterSpacing:2,marginTop:6}}>
          {completed?"YOU FINISHED IT":"GREAT EFFORT"}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div style={{flex:1,overflowY:"auto",padding:"20px 20px 100px"}}>

        {/* Single unified card */}
        <div style={{background:"#fff",borderRadius:22,boxShadow:"0 8px 40px rgba(108,92,231,0.10)",border:"1.5px solid #EDE9FF",overflow:"hidden",animation:"fadeUp .4s ease"}}>

          {/* Kira says */}
          <div style={{padding:"22px 22px 18px",display:"flex",gap:12,alignItems:"flex-start"}}>
            <div style={{flexShrink:0}}><KiraAvatar size={36} talking={kiraTalking}/></div>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"#9B8FEE",letterSpacing:1.5,marginBottom:6}}>KIRA SAYS</div>
              <p style={{margin:0,fontSize:15,color:"#3B2D8A",lineHeight:1.8,fontStyle:"italic"}}>"{script}"</p>
            </div>
          </div>

          <div style={{height:1,background:"#F3F0FF",margin:"0 20px"}}/>

          {/* Vocab chips */}
          <div style={{padding:"16px 22px"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#B0A8D8",letterSpacing:1.5,marginBottom:10}}>WORDS YOU LEARNED TODAY</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {HARD_WORDS.map((w,i)=>(
                <button key={i} onClick={()=>{stopSpeech();setSelectedWord(w);}}
                  style={{display:"flex",alignItems:"center",gap:6,background:selectedWord?.word===w.word?"#EDE9FF":"#F5F3FF",border:`1.5px solid ${selectedWord?.word===w.word?"#6C5CE7":"#C4B5FD"}`,borderRadius:99,padding:"7px 14px",cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}
                  onMouseEnter={e=>{if(selectedWord?.word!==w.word)e.currentTarget.style.background="#EDE9FF";}}
                  onMouseLeave={e=>{if(selectedWord?.word!==w.word)e.currentTarget.style.background="#F5F3FF";}}>
                  <span style={{fontSize:13,fontWeight:700,color:"#4B3DB5"}}>{w.word}</span>
                  <span style={{fontSize:11,color:"#9B8FEE"}}>🔊</span>
                </button>
              ))}
            </div>

            {/* Word detail card */}
            {selectedWord&&(
              <div style={{marginTop:12,background:"linear-gradient(135deg,#F5F3FF,#EEE8FF)",borderRadius:16,padding:"18px 18px 14px",border:"1.5px solid #C4B5FD",position:"relative",animation:"fadeUp .2s ease"}}>
                <button onClick={()=>{stopSpeech();setSelectedWord(null);}} style={{position:"absolute",top:10,right:12,background:"none",border:"none",fontSize:16,color:"#B0A8D8",cursor:"pointer",lineHeight:1}}>×</button>
                <div style={{fontSize:24,fontWeight:900,color:"#3B2D8A",marginBottom:2}}>{selectedWord.word}</div>
                <div style={{fontSize:12,color:"#9B8FEE",letterSpacing:2,marginBottom:10,fontWeight:500}}>{selectedWord.syl}</div>
                <div style={{fontSize:13,color:"#4A4070",lineHeight:1.65,marginBottom:12}}>→ {selectedWord.def}</div>
                <AudioWaveBtn text={`${selectedWord.word}. ${selectedWord.syl.replace(/·/g,' ')}. ${selectedWord.def}`} label={`Hear "${selectedWord.word}"`}/>
              </div>
            )}
          </div>

          <div style={{height:1,background:"#F3F0FF",margin:"0 20px"}}/>

          {/* Read it again */}
          <div style={{padding:"16px 22px 20px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"#B0A8D8",letterSpacing:1.5}}>READ IT AGAIN</div>
              <AudioWaveBtn text={PASSAGE_TEXT} label="Play all"/>
            </div>
            <ClickableSentences/>
          </div>
        </div>
      </div>

      {/* ── Fixed bottom CTA ── */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,display:"flex",justifyContent:"center",pointerEvents:"none"}}>
        <div style={{width:"100%",maxWidth:640,padding:"12px 20px 28px",background:"linear-gradient(to top,#F6F4FF 60%,transparent)",display:"flex",gap:10,pointerEvents:"all"}}>
          <button onClick={()=>{stopSpeech();onRestart();}}
            style={{flex:1,background:"#fff",border:"2px solid #EDE9FF",borderRadius:14,padding:"12px",fontSize:13,fontWeight:600,color:"#9B8FEE",cursor:"pointer",fontFamily:"inherit",transition:"border-color .15s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#C4B5FD"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="#EDE9FF"}>
            ↺ Try again
          </button>
          <PrimaryBtn style={{flex:2,fontSize:15,padding:"13px 28px"}}>Back to Home</PrimaryBtn>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 3b — Echo Complete (transition into Reading)
// ══════════════════════════════════════════════════════════════════════════════
const PageEchoComplete = ({onNext}) => {
  const [f, setF] = useState(0);
  const [kiraTalking, setKiraTalking] = useState(false);
  const [ready, setReady] = useState(false);
  const SCRIPT = "Amazing! You echoed every sentence. Now it's your turn to read the whole story out loud. Take a breath — you've already heard it. You've got this.";
  useEffect(()=>{
    const a = setInterval(()=>setF(x=>x+1), 60);
    setTimeout(()=>{
      setKiraTalking(true);
      speak(SCRIPT, ()=>{ setKiraTalking(false); setReady(true); });
    }, 600);
    return()=>{ clearInterval(a); stopSpeech(); };
  },[]);
  const stars = [3,3,2,3,2];
  return (
    <div style={{display:"flex",height:"100vh",alignItems:"center",justifyContent:"center",background:"linear-gradient(145deg,#EDEAFF,#F8F6FF)",position:"relative",overflow:"hidden",fontFamily:"inherit"}}>
      {Array.from({length:12}).map((_,i)=>(
        <div key={i} style={{position:"absolute",left:`${6+i*8}%`,top:`${((f*1.5+i*28)%110)-5}%`,width:7,height:7,borderRadius:"50%",background:["#C4B5FD","#FDE68A","#6EE7B7","#F9A8D4","#A78BFA"][i%5],opacity:.5,transform:`rotate(${f*2+i*25}deg)`}}/>
      ))}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:0,position:"relative",zIndex:1,maxWidth:440,width:"100%",padding:"0 24px"}}>
        <KiraCharacter size={160} mood="neutral" talking={kiraTalking} celebrating={ready}/>
        <div style={{marginTop:-12,position:"relative",width:"100%"}}>
          <div style={{position:"absolute",top:-9,left:"50%",transform:"translateX(-50%)",width:0,height:0,borderLeft:"9px solid transparent",borderRight:"9px solid transparent",borderBottom:"9px solid rgba(255,255,255,0.97)"}}/>
          <SyncedBubble text={SCRIPT} talking={kiraTalking} style={{fontSize:15,lineHeight:1.8,textAlign:"center",width:"100%",maxWidth:"100%"}}/>
        </div>
        <div style={{marginTop:20,background:"rgba(255,255,255,0.85)",backdropFilter:"blur(16px)",borderRadius:20,padding:"16px 24px",border:"1.5px solid rgba(196,181,253,0.4)",boxShadow:"0 8px 32px rgba(108,92,231,.1)",width:"100%",animation:"fadeUp .5s ease"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#B0A8D8",letterSpacing:1.5,marginBottom:12,textAlign:"center"}}>ECHO READING SUMMARY</div>
          <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
            {stars.map((s,i)=>(
              <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:"#F8F6FF",borderRadius:12,padding:"8px 10px",minWidth:52}}>
                <div style={{fontSize:9,color:"#B0A8D8",fontWeight:600,letterSpacing:.5}}>S{i+1}</div>
                <div style={{display:"flex",gap:1}}>
                  {[0,1,2].map(j=>(
                    <svg key={j} width="10" height="10" viewBox="0 0 24 24">
                      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
                        fill={j<s?"#F59E0B":"#EDE9FF"} stroke={j<s?"#F59E0B":"#C4B5FD"} strokeWidth="1"/>
                    </svg>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        {ready ? (
          <button onClick={()=>{stopSpeech();onNext();}}
            style={{marginTop:20,background:"linear-gradient(135deg,#7B6FD8,#6C5CE7)",border:"none",borderRadius:99,padding:"16px 52px",fontSize:16,fontWeight:700,color:"#fff",cursor:"pointer",boxShadow:"0 8px 28px rgba(108,92,231,.4)",animation:"fadeUp .4s ease",display:"flex",alignItems:"center",gap:10}}>
            Start Reading 📖
          </button>
        ) : (
          <div style={{marginTop:20,fontSize:13,color:"#9B8FEE",fontWeight:500}}>Kira is wrapping up...</div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// DRAGGABLE NAV
// ══════════════════════════════════════════════════════════════════════════════
const LABELS = ["① Intro","② Warm-up","③ Echo","③.5 Ready","④ Reading","⑤ Rating","⑥ Comp","⑦ Results"];
const DraggableNav = ({page, goTo}) => {
  const [pos,setPos]=useState({x:0,y:0});
  const [collapsed,setCollapsed]=useState(false);
  const [dragging,setDragging]=useState(false);
  const ds=useRef();
  const onDown=(e)=>{if(e.target.closest("button[data-nav]"))return;ds.current={mx:e.clientX,my:e.clientY,px:pos.x,py:pos.y};setDragging(true);};
  useEffect(()=>{
    if(!dragging)return;
    const mv=(e)=>setPos({x:ds.current.px+e.clientX-ds.current.mx,y:ds.current.py+e.clientY-ds.current.my});
    const up=()=>setDragging(false);
    window.addEventListener("mousemove",mv);window.addEventListener("mouseup",up);
    return()=>{window.removeEventListener("mousemove",mv);window.removeEventListener("mouseup",up);};
  },[dragging]);
  return (
    <div style={{position:"fixed",top:14,left:"50%",transform:`translate(calc(-50% + ${pos.x}px),${pos.y}px)`,zIndex:999,userSelect:"none"}}>
      <div onMouseDown={onDown} style={{display:"flex",alignItems:"center",gap:4,background:"rgba(255,255,255,.92)",backdropFilter:"blur(12px)",borderRadius:99,padding:"5px 6px",boxShadow:"0 2px 20px rgba(108,92,231,.15)",border:"1px solid rgba(108,92,231,.1)",cursor:dragging?"grabbing":"grab"}}>
        <div style={{display:"flex",flexDirection:"column",gap:3,padding:"0 4px",opacity:.35}}>{[0,1].map(r=><div key={r} style={{display:"flex",gap:3}}>{[0,1].map(c=><div key={c} style={{width:3,height:3,borderRadius:"50%",background:"#6C5CE7"}}/>)}</div>)}</div>
        {!collapsed&&LABELS.map((l,i)=><button key={i} data-nav="1" onClick={()=>goTo(i)} style={{padding:"6px 12px",borderRadius:99,border:"none",background:page===i?"#6C5CE7":"transparent",color:page===i?"#fff":"#9B8FEE",fontSize:12,fontWeight:page===i?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all .2s",whiteSpace:"nowrap"}}>{l}</button>)}
        {collapsed&&<div style={{padding:"4px 12px",fontSize:12,fontWeight:700,color:"#6C5CE7"}}>{LABELS[page]}</div>}
        <button data-nav="1" onClick={()=>setCollapsed(c=>!c)} style={{width:26,height:26,borderRadius:"50%",border:"none",background:"#F2EFFF",color:"#6C5CE7",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginLeft:2}}>{collapsed?"＋":"－"}</button>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// APP
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [page,setPage]=useState(0);
  const [rating,setRating]=useState("medium");
  const [readingCompleted,setReadingCompleted]=useState(true);
  const goTo=(n)=>{stopSpeech();setPage(n);};

  const renderPage=()=>{
    switch(page){
      case 0: return <PageIntro    onNext={()=>goTo(1)}/>;
      case 1: return <PageWarmup   onNext={()=>goTo(2)}/>;
      case 2: return <PageEcho     onNext={()=>goTo(3)}/>;
      case 3: return <PageEchoComplete onNext={()=>goTo(4)}/>;
      case 4: return <PageGuided   onNext={(r)=>{ setReadingCompleted(r.completed); goTo(5); }}/>;
      case 5: return <PageRating   onNext={r=>{ setRating(r); goTo(6); }} completed={readingCompleted}/>;
      case 6: return <PageComp     onNext={()=>goTo(7)}/>;
      case 7: return <PageResults  rating={rating} completed={readingCompleted} onRestart={()=>goTo(0)}/>;
      default: return <PageIntro   onNext={()=>goTo(1)}/>;
    }
  };
  return (
    <div style={{fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <DraggableNav page={page} goTo={goTo}/>
      <div key={page}>{renderPage()}</div>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulseRing{0%{opacity:.2}50%{opacity:.06}100%{opacity:.2}}
        @keyframes waveBar{from{transform:scaleY(1)}to{transform:scaleY(1.8)}}
        *{box-sizing:border-box}
      `}</style>
    </div>
  );
}
