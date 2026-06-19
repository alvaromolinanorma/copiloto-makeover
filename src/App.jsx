import { useState, useRef, useEffect } from "react";

const CLIENT_CONFIG = {
  nombre: "Makeover",
  nicho: "Moda Masculina",
  producto: "programa personalizado de estilo y armario para hombres",
  dolores_comunes: ["ropa que no combina con nada","no saber qué ponerse cada día","falta de confianza con la imagen","querer proyectar más autoridad","diferenciarse en el entorno profesional"],
  calendly_url: "https://api.leadconnectorhq.com/widget/bookings/modamasculinatips",
  color_primario: "#e2e2e2",
};

const buildSystemPrompt = (config) => `Eres un copiloto de ventas experto entrenado en el Sistema de Prospección Inbound Norma, especializado en ${config.nicho}.
Tu misión: analizar conversaciones de WhatsApp/DM con leads y sugerir exactamente qué responder para avanzar hacia una llamada de ventas agendada.
PRODUCTO QUE SE VENDE: ${config.producto}
DOLORES MÁS COMUNES EN ESTE NICHO:
${config.dolores_comunes.map((d) => `- ${d}`).join("\n")}
ENLACE DE AGENDADO: ${config.calendly_url}

## EL SISTEMA TIENE 8 FASES:
FASE 1 — APERTURA: Primer contacto. No puede parecer venta. Prometer valor, pregunta abierta.
FASE 2 — CONTEXTO PRESENTE: Entender su situación. Solo escuchar y preguntar. Preguntas abiertas (qué, cómo, cuánto). Nunca sí/no.
FASE 3 — DIAGNÓSTICO DEL DOLOR: Fase más crítica. Articular obstáculo principal, cuánto lleva con él y qué ha intentado. Preguntas clave: ¿Cuál es tu mayor freno? ¿Desde cuándo? ¿Por qué sigue sin resolverse? ¿Qué has intentado?
FASE 4 — ESTADO DESEADO: Conectar el dolor con lo que quiere conseguir. ¿Qué cambiaría en tu vida si lo resolvieras? Mover del plano racional al emocional.
FASE 5 — CUALIFICACIÓN ECONÓMICA (opcional): Solo si hay dudas. Tono natural, no brusco.
FASE 6 — PITCH DE LLAMADA: Proponer sesión de 40 minutos con valor propio. NO como demo de ventas. Incluye: análisis situación + plan de acción 30 días + explicación del programa solo si tiene sentido. Usar prueba social. IMPORTANTE: El pitch siempre termina con "¿Te parece bien?" o "¿Lo hacemos?" — NUNCA preguntes cuándo tienen hueco ni qué semana. Tú propones, ellos confirman.
FASE 7 — ENLACE DE AGENDADO: En cuanto el lead confirme con cualquier señal positiva, mandar inmediatamente el enlace ${config.calendly_url} — pedir que confirme cuando lo haga. Añadir escasez suave.
FASE 8 — TRIAGE POST-AGENDADO: Detectar red flags. Confirmación inmediata. Recordatorio el día de la llamada.

## REGLAS DE ORO:
- UNA sola pregunta por mensaje. Nunca dos.
- No ofrecer soluciones antes de tiempo.
- No proponer la llamada antes de tener dolor + estado deseado claros.
- Si el lead pregunta el precio → no dar número, redirigir a la llamada.
- Si dice "por ahora ideas" → profundizar en el dolor, no rendirse.
- Usar su propio vocabulario cuando reformules su dolor.
- Tono: cercano, directo, masculino. Como un amigo que sabe de lo que habla.

## CUALIFICACIÓN DEL LEAD:
CUALIFICACIÓN DE PROBLEMA: "si"|"parcial"|"no"|"sin_datos"
CUALIFICACIÓN ECONÓMICA: "formulario"|"probable_si"|"dudoso"|"no"

## FORMATO DE RESPUESTA — JSON EXACTO:
{"fase_actual":"FASE X — NOMBRE","numero_fase":X,"analisis":"...","siguiente_objetivo":"...","mensaje_sugerido":"...","por_que":"...","señal_de_avance":"...","nivel_de_interes":"alto|medio|bajo","cualificacion_problema":"si|parcial|no|sin_datos","cualificacion_economica":"formulario|probable_si|dudoso|no","razon_cualificacion":"...","alerta":"null o descripción"}`;

const buildClosePrompt = (outcome) => `Eres un coach de ventas experto en el Sistema Inbound Norma. Analiza esta conversación que ha terminado con el resultado: "${outcome}".
Tu misión: identificar con precisión quirúrgica qué errores se cometieron, en qué momento y por qué el lead no llegó a agendar.
Responde SOLO con este JSON exacto sin texto adicional:
{"errores":[{"tipo":"nombre corto del error","momento":"en qué parte ocurrió","descripcion":"qué pasó y por qué fue un error","como_evitarlo":"qué debería haberse hecho"}],"resumen":"Una frase que resume el error principal","aprendizaje_clave":"La lección más importante","fase_donde_se_perdio":"En qué fase se rompió la conversación"}`;

const PHASES = [{id:1,label:"Apertura"},{id:2,label:"Contexto"},{id:3,label:"Dolor"},{id:4,label:"Deseado"},{id:5,label:"Cualif."},{id:6,label:"Pitch"},{id:7,label:"Agenda"},{id:8,label:"Triage"}];
const INTEREST_COLORS = {alto:{bg:"#0f2a0f",border:"#22c55e44",text:"#22c55e",dot:"#22c55e"},medio:{bg:"#2a1f0a",border:"#f59e0b44",text:"#f59e0b",dot:"#f59e0b"},bajo:{bg:"#2a0f0f",border:"#ef444444",text:"#ef4444",dot:"#ef4444"}};
const FEEDBACK_QUICK = ["Más corto","Más directo","Más cercano","Más formal","Hazlo una pregunta","Cambia el enfoque"];
const OUTCOMES = [{id:"no_agendo",label:"Envié el enlace pero no agendó",icon:"📅"},{id:"se_enfrió",label:"Se enfrió sin motivo claro",icon:"🧊"},{id:"se_quemó",label:"Se quemó / pidió que parara",icon:"🔥"},{id:"precio",label:"Preguntó precio y desapareció",icon:"💸"},{id:"no_perfil",label:"No era el perfil",icon:"❌"},{id:"agendó",label:"Agendó correctamente ✅",icon:"✅"}];
const STORAGE_KEY = "makeover_learnings_v1";

function parseClaude(text) {
  try { return JSON.parse(text.trim()); } catch {}
  try { const m = text.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); } catch {}
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s !== -1 && e !== -1) { try { return JSON.parse(text.slice(s, e + 1)); } catch {} }
  return null;
}

async function callClaude(system, messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {"Content-Type":"application/json","x-api-key":process.env.REACT_APP_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
    body: JSON.stringify({model:"claude-sonnet-4-6",max_tokens:2000,system,messages}),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.find((b) => b.type === "text")?.text || "";
}

export default function CopilotoProVentas() {
  const [tab, setTab] = useState("copiloto");
  const [conversation, setConversation] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);
  const [showClose, setShowClose] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeError, setCloseError] = useState(null);
  const [learnings, setLearnings] = useState([]);
  const [repeatWarnings, setRepeatWarnings] = useState([]);
  const resultRef = useRef(null);

  useEffect(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) setLearnings(JSON.parse(saved)); } catch {}
  }, []);

  const saveLearnings = (nl) => { setLearnings(nl); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(nl)); } catch {} };

  const checkRepeatErrors = (allLearnings) => {
    if (!allLearnings.length) return;
    const errorTypes = allLearnings.flatMap(l => l.errores?.map(e => e.tipo) || []);
    const counts = {};
    errorTypes.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    const warnings = Object.entries(counts).filter(([,c]) => c >= 2).map(([tipo]) => {
      const ex = allLearnings.find(l => l.errores?.some(e => e.tipo === tipo));
      return { tipo, count: counts[tipo], como_evitarlo: ex?.errores?.find(e => e.tipo === tipo)?.como_evitarlo };
    });
    setRepeatWarnings(warnings);
  };

  const analyze = async () => {
    if (!conversation.trim()) return;
    setLoading(true); setError(null); setResult(null); setRepeatWarnings([]); setShowClose(false);
    try {
      const text = await callClaude(buildSystemPrompt(CLIENT_CONFIG), [{role:"user",content:`Analiza esta conversación y responde SOLO con el JSON exacto:\n\n${conversation}`}]);
      const parsed = parseClaude(text);
      if (!parsed) { setError("No se pudo leer la respuesta: " + text.slice(0, 100)); return; }
      setResult(parsed);
      checkRepeatErrors(learnings);
      setTimeout(() => resultRef.current?.scrollIntoView({behavior:"smooth",block:"start"}), 100);
    } catch (err) { setError(`Error: ${err.message}`); }
    finally { setLoading(false); }
  };

  const refine = async (customFeedback) => {
    const fb = customFeedback || feedback;
    if (!fb.trim() || !result) return;
    setFeedbackLoading(true); setFeedbackError(null);
    try {
      const text = await callClaude(buildSystemPrompt(CLIENT_CONFIG), [
        {role:"user",content:`Analiza esta conversación:\n\n${conversation}`},
        {role:"assistant",content:JSON.stringify(result)},
        {role:"user",content:`Feedback: "${fb}". Mejora el mensaje_sugerido. SOLO JSON.`},
      ]);
      const parsed = parseClaude(text);
      if (!parsed) { setFeedbackError("No se pudo procesar."); return; }
      setResult(parsed); setFeedback("");
    } catch (err) { setFeedbackError(`Error: ${err.message}`); }
    finally { setFeedbackLoading(false); }
  };

  const closeConversation = async () => {
    if (!selectedOutcome || !conversation.trim()) return;
    setCloseLoading(true); setCloseError(null);
    const outcome = OUTCOMES.find(o => o.id === selectedOutcome);
    try {
      const text = await callClaude(buildClosePrompt(outcome.label), [{role:"user",content:`Analiza esta conversación. SOLO JSON:\n\n${conversation}`}]);
      const parsed = parseClaude(text);
      if (!parsed) { setCloseError("No se pudo analizar. Intenta de nuevo."); return; }
      const newLearning = {id:Date.now(),fecha:new Date().toLocaleDateString("es-ES"),outcome:outcome.label,outcomeIcon:outcome.icon,...parsed};
      saveLearnings([newLearning, ...learnings]);
      setShowClose(false); setSelectedOutcome(null); setTab("aprendizajes");
    } catch (err) { setCloseError(`Error: ${err.message}`); }
    finally { setCloseLoading(false); }
  };

  const copyMessage = () => { if (!result?.mensaje_sugerido) return; navigator.clipboard.writeText(result.mensaje_sugerido); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const deleteLearning = (id) => saveLearnings(learnings.filter(l => l.id !== id));

  const phaseNum = result?.numero_fase || 0;
  const interest = result?.nivel_de_interes || "medio";
  const interestStyle = INTEREST_COLORS[interest] || INTEREST_COLORS.medio;
  const silver = CLIENT_CONFIG.color_primario;
  const gold = "#c9a84c";

  return (
    <div style={{minHeight:"100vh",background:"#080808",color:"#e8e0cc",fontFamily:"'DM Sans','Helvetica Neue',sans-serif"}}>
      {/* Header */}
      <div style={{background:"linear-gradient(180deg,#111111 0%,#080808 100%)",borderBottom:"1px solid #222222",padding:"24px 40px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:"20px"}}>
          <div style={{width:"52px",height:"52px",borderRadius:"50%",background:"linear-gradient(145deg,#2a2a2a,#111111)",border:"1.5px solid #404040",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <polygon points="50,4 93,27 93,73 50,96 7,73 7,27" fill="none" stroke="#c0c0c0" strokeWidth="5"/>
              <text x="50" y="68" textAnchor="middle" fill="#e0e0e0" fontSize="52" fontWeight="900" fontFamily="'DM Sans',Helvetica,sans-serif" letterSpacing="-4">M</text>
            </svg>
          </div>
          <div style={{width:"1px",height:"36px",background:"#222222",flexShrink:0}} />
          <div>
            <div style={{fontSize:"10px",color:"#555555",letterSpacing:"2.5px",textTransform:"uppercase"}}>Sistema Inbound Setteo Norma</div>
            <div style={{fontSize:"14px",fontWeight:"700",color:"#e2e2e2",letterSpacing:"1.5px",textTransform:"uppercase",marginTop:"4px"}}>Proyecto Makeover</div>
          </div>
        </div>
        <div style={{display:"flex",gap:"8px"}}>
          {[{id:"copiloto",label:"⚡ Copiloto"},{id:"aprendizajes",label:`📚 Aprendizajes${learnings.length ? ` (${learnings.length})` : ""}`}].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{padding:"8px 18px",borderRadius:"20px",border:"1px solid",borderColor:tab===t.id?`${silver}66`:"#1e1e1e",background:tab===t.id?`${silver}12`:"transparent",color:tab===t.id?silver:"#555555",fontSize:"12px",fontWeight:"600",cursor:"pointer",letterSpacing:"0.5px",fontFamily:"'DM Sans',sans-serif"}}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* COPILOTO TAB */}
      {tab === "copiloto" && (
        <div style={{maxWidth:"800px",margin:"0 auto",padding:"40px 24px"}}>
          {/* Phase tracker */}
          <div style={{marginBottom:"36px"}}>
            <div style={{fontSize:"11px",color:"#555555",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"12px"}}>FASES DEL SISTEMA</div>
            <div style={{display:"flex",gap:"4px",alignItems:"center"}}>
              {PHASES.map((phase, i) => {
                const isActive = phaseNum === phase.id, isPast = phaseNum > phase.id;
                return (
                  <div key={phase.id} style={{display:"flex",alignItems:"center",gap:"4px",flex:1}}>
                    <div style={{flex:1,padding:"8px 4px",textAlign:"center",borderRadius:"6px",fontSize:"11px",fontWeight:isActive?"700":"500",background:isActive?`${silver}18`:isPast?"#111111":"transparent",color:isActive?gold:isPast?`${gold}66`:"#2a2010",border:`1px solid ${isActive?silver+"99":isPast?silver+"33":"#1e1e1e"}`,transition:"all 0.3s"}}>
                      <div style={{fontSize:"10px",opacity:0.7,marginBottom:"2px"}}>{phase.id}</div>
                      {phase.label}
                    </div>
                    {i < PHASES.length - 1 && <div style={{width:"12px",height:"1px",background:isPast?`${gold}44`:"#1a1408",flexShrink:0}} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Textarea */}
          <div style={{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:"12px",overflow:"hidden",marginBottom:"16px"}}>
            <div style={{padding:"12px 20px",borderBottom:"1px solid #161616",display:"flex",alignItems:"center",gap:"8px"}}>
              <div style={{width:"8px",height:"8px",borderRadius:"50%",background:"#2a2a2a"}} />
              <div style={{width:"8px",height:"8px",borderRadius:"50%",background:"#2a2a2a"}} />
              <div style={{width:"8px",height:"8px",borderRadius:"50%",background:"#2a2a2a"}} />
              <span style={{marginLeft:"8px",fontSize:"11px",color:"#333333",letterSpacing:"1.5px",textTransform:"uppercase"}}>Conversación con el Lead</span>
            </div>
            <textarea value={conversation} onChange={e => setConversation(e.target.value)} placeholder="Pega aquí la conversación completa de WhatsApp o DM..." rows={10} style={{width:"100%",background:"transparent",border:"none",outline:"none",color:"#aaaaaa",fontSize:"14px",lineHeight:"1.8",padding:"20px",resize:"vertical",boxSizing:"border-box",fontFamily:"'DM Sans','Helvetica Neue',sans-serif"}} />
          </div>

          <button onClick={analyze} disabled={loading || !conversation.trim()} style={{width:"100%",padding:"18px",borderRadius:"10px",border:"none",background:loading||!conversation.trim()?"#1a1810":`linear-gradient(135deg,${silver} 0%,#aaaaaa 100%)`,color:loading||!conversation.trim()?"#333333":"#080808",fontSize:"14px",fontWeight:"700",cursor:loading||!conversation.trim()?"not-allowed":"pointer",letterSpacing:"1px",textTransform:"uppercase",display:"flex",alignItems:"center",justifyContent:"center",gap:"12px"}}>
            {loading?(<><span style={{display:"inline-block",width:"14px",height:"14px",border:`2px solid #3a3020`,borderTopColor:silver,borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />Analizando conversación...</>):"⚡ Analizar y generar respuesta"}
          </button>

          {error && <div style={{marginTop:"16px",padding:"14px 18px",background:"#1a0a0a",border:"1px solid #3a1010",borderRadius:"8px",color:"#f87171",fontSize:"13px"}}>{error}</div>}

          {result && (
            <div ref={resultRef} style={{marginTop:"40px"}}>

              {/* Repeat warnings */}
              {repeatWarnings.length > 0 && (
                <div style={{marginBottom:"16px",padding:"16px 20px",background:"#1a0800",border:"1px solid #f5730044",borderRadius:"10px"}}>
                  <div style={{fontSize:"11px",color:"#f57300",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"10px",fontWeight:"700"}}>⚠ Errores repetidos detectados</div>
                  {repeatWarnings.map((w,i) => (
                    <div key={i} style={{marginBottom:i<repeatWarnings.length-1?"10px":"0",paddingBottom:i<repeatWarnings.length-1?"10px":"0",borderBottom:i<repeatWarnings.length-1?"1px solid #2a1500":"none"}}>
                      <div style={{fontSize:"13px",color:"#f59730",fontWeight:"600"}}>"{w.tipo}" — cometido {w.count} veces antes</div>
                      {w.como_evitarlo && <div style={{fontSize:"12px",color:"#8a6030",marginTop:"4px"}}>→ {w.como_evitarlo}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Badges */}
              <div style={{display:"flex",gap:"10px",marginBottom:"16px",flexWrap:"wrap"}}>
                <div style={{padding:"8px 18px",borderRadius:"6px",background:`${silver}10`,border:`1px solid ${silver}33`,color:silver,fontSize:"13px",fontWeight:"700"}}>{result.fase_actual}</div>
                <div style={{padding:"8px 18px",borderRadius:"6px",background:interestStyle.bg,border:`1px solid ${interestStyle.border}`,color:interestStyle.text,fontSize:"12px",fontWeight:"600",display:"flex",alignItems:"center",gap:"7px"}}>
                  <div style={{width:"7px",height:"7px",borderRadius:"50%",background:interestStyle.dot}} />
                  INTERÉS {interest.toUpperCase()}
                </div>
                {result.cualificacion_problema && (() => {
                  const qMap={si:{bg:"#0f2a0f",border:"#22c55e44",color:"#22c55e",icon:"✓",label:"CUALIFICADO"},parcial:{bg:"#2a1f0a",border:"#f59e0b44",color:"#f59e0b",icon:"◑",label:"PARCIAL"},no:{bg:"#2a0f0f",border:"#ef444444",color:"#ef4444",icon:"✗",label:"NO CUALIFICADO"},sin_datos:{bg:"#141414",border:"#6b728044",color:"#6b7280",icon:"?",label:"SIN DATOS"}};
                  const q=qMap[result.cualificacion_problema]||qMap.sin_datos;
                  return <div title={result.razon_cualificacion} style={{padding:"8px 18px",borderRadius:"6px",background:q.bg,border:`1px solid ${q.border}`,color:q.color,fontSize:"12px",fontWeight:"600",cursor:"help"}}>{q.icon} {q.label}</div>;
                })()}
                {result.cualificacion_economica&&result.cualificacion_economica!=="formulario"&&(()=>{
                  const eMap={probable_si:{bg:"#0f1a2a",border:"#3b82f644",color:"#3b82f6",icon:"💰",label:"PUEDE PAGAR"},dudoso:{bg:"#2a1a0a",border:"#f5973044",color:"#f59730",icon:"⚠",label:"EC. DUDOSO"},no:{bg:"#2a0f0f",border:"#ef444444",color:"#ef4444",icon:"✗",label:"SIN PRESUPUESTO"}};
                  const e=eMap[result.cualificacion_economica]; if(!e) return null;
                  return <div style={{padding:"8px 18px",borderRadius:"6px",background:e.bg,border:`1px solid ${e.border}`,color:e.color,fontSize:"12px",fontWeight:"600"}}>{e.icon} {e.label}</div>;
                })()}
                {result.alerta&&result.alerta!=="null"&&<div style={{padding:"8px 18px",borderRadius:"6px",background:"#1a0f00",border:"1px solid #f5973044",color:"#f59730",fontSize:"12px",fontWeight:"600"}}>⚠ {result.alerta}</div>}
              </div>

              {result.razon_cualificacion && <div style={{marginBottom:"16px",padding:"12px 18px",background:"#0f0f0f",border:"1px solid #1e1e1e",borderRadius:"8px",fontSize:"12px",color:"#6a5a3a",lineHeight:"1.6"}}><span style={{color:"#555555",fontWeight:"700",fontSize:"10px",letterSpacing:"0.5px",textTransform:"uppercase"}}>📋 Cualificación — </span>{result.razon_cualificacion}</div>}

              {/* Analysis grid */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"12px"}}>
                <div style={{background:"#0f0f0f",border:"1px solid #1e1e1e",borderRadius:"10px",padding:"18px"}}>
                  <div style={{fontSize:"10px",color:"#555555",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"10px"}}>🔍 Análisis</div>
                  <div style={{fontSize:"13px",color:"#888888",lineHeight:"1.7"}}>{result.analisis}</div>
                </div>
                <div style={{background:"#0f0f0f",border:"1px solid #1e1e1e",borderRadius:"10px",padding:"18px"}}>
                  <div style={{fontSize:"10px",color:"#555555",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"10px"}}>🎯 Objetivo</div>
                  <div style={{fontSize:"13px",color:"#888888",lineHeight:"1.7"}}>{result.siguiente_objetivo}</div>
                </div>
              </div>

              {/* Message */}
              <div style={{background:"linear-gradient(135deg,#111111 0%,#141414 100%)",border:`1px solid ${silver}33`,borderRadius:"12px",overflow:"hidden",marginBottom:"12px",boxShadow:`0 0 30px ${silver}11`}}>
                <div style={{padding:"14px 20px",borderBottom:`1px solid ${silver}1a`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:"10px",color:gold,letterSpacing:"1.5px",textTransform:"uppercase",fontFamily:"Georgia,serif"}}>💬 Mensaje a enviar</div>
                  <button onClick={copyMessage} style={{padding:"6px 16px",borderRadius:"6px",border:`1px solid ${copied?"#22c55e44":`${silver}22`}`,background:copied?"#0f2a0f":"#1a1508",color:copied?"#22c55e":silver,fontSize:"11px",fontWeight:"700",cursor:"pointer",textTransform:"uppercase"}}>
                    {copied?"✓ Copiado":"Copiar"}
                  </button>
                </div>
                <div style={{padding:"24px",fontSize:"15px",color:"#e0e0e0",lineHeight:"1.9",whiteSpace:"pre-wrap",fontFamily:"Georgia,serif"}}>{result.mensaje_sugerido}</div>
              </div>

              {/* Feedback */}
              <div style={{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:"12px",padding:"20px",marginBottom:"12px"}}>
                <div style={{fontSize:"10px",color:"#555555",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"14px"}}>🔁 Mejorar el mensaje</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:"8px",marginBottom:"14px"}}>
                  {FEEDBACK_QUICK.map(q => (
                    <button key={q} onClick={() => refine(q)} disabled={feedbackLoading} style={{padding:"6px 14px",borderRadius:"20px",border:"1px solid #2a2a2a",background:"#161616",color:feedbackLoading?"#333":"#888888",fontSize:"12px",cursor:feedbackLoading?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif"}}>{q}</button>
                  ))}
                </div>
                <div style={{display:"flex",gap:"10px"}}>
                  <input value={feedback} onChange={e => setFeedback(e.target.value)} onKeyDown={e => e.key==="Enter"&&refine()} placeholder="O dime exactamente cómo mejorarlo..." disabled={feedbackLoading} style={{flex:1,padding:"10px 16px",background:"#111111",border:"1px solid #2a2a2a",borderRadius:"8px",color:"#cccccc",fontSize:"13px",outline:"none",fontFamily:"'DM Sans',sans-serif"}} />
                  <button onClick={() => refine()} disabled={feedbackLoading||!feedback.trim()} style={{padding:"10px 20px",borderRadius:"8px",border:"none",background:feedbackLoading||!feedback.trim()?"#1a1a1a":`linear-gradient(135deg,${silver} 0%,#aaaaaa 100%)`,color:feedbackLoading||!feedback.trim()?"#333":"#080808",fontSize:"12px",fontWeight:"700",cursor:feedbackLoading||!feedback.trim()?"not-allowed":"pointer",textTransform:"uppercase",whiteSpace:"nowrap"}}>
                    {feedbackLoading?"...":"Refinar"}
                  </button>
                </div>
                {feedbackError && <div style={{marginTop:"10px",color:"#f87171",fontSize:"12px"}}>{feedbackError}</div>}
              </div>

              {/* Why + Signal */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"16px"}}>
                <div style={{background:"#0f0f0f",border:"1px solid #1e1e1e",borderRadius:"10px",padding:"18px"}}>
                  <div style={{fontSize:"10px",color:"#555555",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"10px"}}>🧠 Por qué este mensaje</div>
                  <div style={{fontSize:"13px",color:"#888888",lineHeight:"1.7"}}>{result.por_que}</div>
                </div>
                <div style={{background:"#0f0f0f",border:"1px solid #1e1e1e",borderRadius:"10px",padding:"18px"}}>
                  <div style={{fontSize:"10px",color:"#555555",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"10px"}}>✅ Señal de avance</div>
                  <div style={{fontSize:"13px",color:"#888888",lineHeight:"1.7"}}>{result.señal_de_avance}</div>
                </div>
              </div>

              {/* Close conversation */}
              {!showClose ? (
                <button onClick={() => setShowClose(true)} style={{width:"100%",padding:"14px",borderRadius:"10px",border:"1px solid #2a1a1a",background:"transparent",color:"#666666",fontSize:"13px",cursor:"pointer",letterSpacing:"0.5px",fontFamily:"'DM Sans',sans-serif"}}>
                  🔒 Cerrar conversación y analizar errores
                </button>
              ) : (
                <div style={{background:"#0d0d0d",border:"1px solid #2a1a0a",borderRadius:"12px",padding:"24px"}}>
                  <div style={{fontSize:"11px",color:"#f59730",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"16px",fontWeight:"700"}}>🔒 ¿Cómo terminó esta conversación?</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"16px"}}>
                    {OUTCOMES.map(o => (
                      <button key={o.id} onClick={() => setSelectedOutcome(o.id)} style={{padding:"12px 16px",borderRadius:"8px",border:`1px solid ${selectedOutcome===o.id?"#f5973066":"#222222"}`,background:selectedOutcome===o.id?"#1a1000":"#111111",color:selectedOutcome===o.id?"#f59730":"#666666",fontSize:"13px",cursor:"pointer",textAlign:"left",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s"}}>
                        {o.icon} {o.label}
                      </button>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:"10px"}}>
                    <button onClick={closeConversation} disabled={!selectedOutcome||closeLoading} style={{flex:1,padding:"12px",borderRadius:"8px",border:"none",background:!selectedOutcome||closeLoading?"#1a1a1a":"linear-gradient(135deg,#f59730 0%,#c97820 100%)",color:!selectedOutcome||closeLoading?"#333":"#080808",fontSize:"13px",fontWeight:"700",cursor:!selectedOutcome||closeLoading?"not-allowed":"pointer",textTransform:"uppercase",letterSpacing:"0.5px"}}>
                      {closeLoading?"Analizando errores...":"⚡ Analizar y guardar aprendizaje"}
                    </button>
                    <button onClick={() => {setShowClose(false);setSelectedOutcome(null);}} style={{padding:"12px 20px",borderRadius:"8px",border:"1px solid #222",background:"transparent",color:"#555",fontSize:"13px",cursor:"pointer"}}>Cancelar</button>
                  </div>
                  {closeError && <div style={{marginTop:"10px",color:"#f87171",fontSize:"12px"}}>{closeError}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* APRENDIZAJES TAB */}
      {tab === "aprendizajes" && (
        <div style={{maxWidth:"900px",margin:"0 auto",padding:"40px 24px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"32px"}}>
            <div>
              <div style={{fontSize:"20px",fontWeight:"700",color:silver,marginBottom:"6px"}}>📚 Aprendizajes</div>
              <div style={{fontSize:"13px",color:"#555555"}}>{learnings.length} conversaciones analizadas — los errores se detectan automáticamente al analizar nuevas conversaciones</div>
            </div>
            {learnings.length > 0 && (
              <div style={{padding:"8px 16px",borderRadius:"8px",background:"#0f0f0f",border:"1px solid #1e1e1e",fontSize:"12px",color:"#555"}}>
                {[...new Set(learnings.flatMap(l => l.errores?.map(e => e.tipo)||[]))].length} tipos de errores registrados
              </div>
            )}
          </div>

          {learnings.length === 0 ? (
            <div style={{textAlign:"center",padding:"80px 40px",color:"#333333"}}>
              <div style={{fontSize:"48px",marginBottom:"16px"}}>📋</div>
              <div style={{fontSize:"16px",marginBottom:"8px",color:"#444"}}>Aún no hay aprendizajes guardados</div>
              <div style={{fontSize:"13px"}}>Cuando cierres una conversación desde el Copiloto, el análisis aparecerá aquí</div>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:"20px"}}>
              {learnings.map(l => (
                <div key={l.id} style={{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:"12px",overflow:"hidden"}}>
                  <div style={{padding:"16px 20px",borderBottom:"1px solid #161616",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                      <span style={{fontSize:"20px"}}>{l.outcomeIcon}</span>
                      <div>
                        <div style={{fontSize:"13px",fontWeight:"600",color:"#cccccc"}}>{l.outcome}</div>
                        <div style={{fontSize:"11px",color:"#444444",marginTop:"2px"}}>{l.fecha} · Fase perdida: {l.fase_donde_se_perdio||"—"}</div>
                      </div>
                    </div>
                    <button onClick={() => deleteLearning(l.id)} style={{padding:"4px 10px",borderRadius:"6px",border:"1px solid #2a1a1a",background:"transparent",color:"#444",fontSize:"11px",cursor:"pointer"}}>Eliminar</button>
                  </div>
                  <div style={{padding:"16px 20px",borderBottom:"1px solid #161616"}}>
                    <div style={{fontSize:"11px",color:"#555555",letterSpacing:"1px",textTransform:"uppercase",marginBottom:"8px"}}>💡 Aprendizaje clave</div>
                    <div style={{fontSize:"14px",color:"#e0c080",fontWeight:"600",lineHeight:"1.6"}}>{l.aprendizaje_clave}</div>
                    {l.resumen && <div style={{fontSize:"13px",color:"#666666",marginTop:"6px",lineHeight:"1.6"}}>{l.resumen}</div>}
                  </div>
                  {l.errores && l.errores.length > 0 && (
                    <div style={{padding:"16px 20px"}}>
                      <div style={{fontSize:"11px",color:"#555555",letterSpacing:"1px",textTransform:"uppercase",marginBottom:"12px"}}>🚨 Errores detectados</div>
                      <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
                        {l.errores.map((e,i) => (
                          <div key={i} style={{background:"#111111",border:"1px solid #1e1e1e",borderLeft:"3px solid #f5973055",borderRadius:"8px",padding:"14px 16px"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
                              <div style={{fontSize:"13px",fontWeight:"700",color:"#f59730"}}>{e.tipo}</div>
                              <div style={{fontSize:"11px",color:"#444444",maxWidth:"40%",textAlign:"right"}}>{e.momento}</div>
                            </div>
                            <div style={{fontSize:"12px",color:"#777777",lineHeight:"1.6",marginBottom:"6px"}}>{e.descripcion}</div>
                            <div style={{fontSize:"12px",color:"#22c55e88",lineHeight:"1.6"}}>→ {e.como_evitarlo}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} textarea::placeholder{color:#252525} input::placeholder{color:#333333} *{box-sizing:border-box} ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:#0c0b08} ::-webkit-scrollbar-thumb{background:#2a2010;border-radius:3px}`}</style>
    </div>
  );
}
