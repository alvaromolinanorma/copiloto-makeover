import { useState, useRef } from "react";

// ─── CONFIGURACIÓN DEL CLIENTE ───────────────────────────────────────────────
// Para adaptar este copiloto a un nuevo cliente, solo cambia este objeto
const CLIENT_CONFIG = {
  nombre: "Makeover",
  nicho: "Moda Masculina",
  producto: "programa personalizado de estilo y armario para hombres",
  dolores_comunes: [
    "ropa que no combina con nada",
    "no saber qué ponerse cada día",
    "falta de confianza con la imagen",
    "querer proyectar más autoridad",
    "diferenciarse en el entorno profesional",
  ],
  calendly_url: "https://api.leadconnectorhq.com/widget/bookings/modamasculinatips",
  color_primario: "#e2e2e2",
  color_secundario: "#0a0a0a",
};

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
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

FASE 6 — PITCH DE LLAMADA: Proponer sesión de 40 minutos con valor propio. NO como demo de ventas. Incluye: análisis situación + plan de acción 30 días + explicación del programa solo si tiene sentido. Usar prueba social. IMPORTANTE: El pitch siempre termina con "¿Te parece bien?" o "¿Lo hacemos?" — NUNCA preguntes cuándo tienen hueco ni qué semana. Tú propones, ellos confirman. Cuando confirmen, vas directo al enlace.

FASE 7 — ENLACE DE AGENDADO: En cuanto el lead confirme con cualquier señal positiva ("sí", "vale", "me parece bien", "perfecto", etc.), mandar inmediatamente el enlace ${config.calendly_url} — pedir que confirme cuando lo haga. Añadir escasez suave.

FASE 8 — TRIAGE POST-AGENDADO: Detectar red flags. Confirmación inmediata. Recordatorio el día de la llamada.

## REGLAS DE ORO:
- UNA sola pregunta por mensaje. Nunca dos.
- No ofrecer soluciones antes de tiempo.
- No proponer la llamada antes de tener dolor + estado deseado claros.
- Si el lead pregunta el precio → no dar número, redirigir a la llamada.
- Si dice "por ahora ideas" → profundizar en el dolor, no rendirse.
- Usar su propio vocabulario cuando reformules su dolor.
- Tono: cercano, directo, masculino. Como un amigo que sabe de lo que habla.
- Nunca hacer más de una pregunta por mensaje.

## CUALIFICACIÓN DEL LEAD:
Evalúa siempre dos dimensiones:

CUALIFICACIÓN DE PROBLEMA: ¿Tiene el lead un problema que el producto resuelve?
- "si" → Ha confirmado claramente que tiene el dolor que resolvemos
- "parcial" → Ha dado señales pero no lo ha articulado del todo
- "no" → No parece tener el problema o no es nuestro perfil
- "sin_datos" → Aún no hay suficiente información para determinar

CUALIFICACIÓN ECONÓMICA: Solo evalúala si hay señales claras de que no puede permitírselo (paro, estudiante, menciona problemas de dinero, etc). En la mayoría de casos ponla como "formulario" ya que eso se recoge en el formulario de agendado.
- "formulario" → Se recoge en el formulario de Calendly, no hace falta preguntarlo
- "probable_si" → Señales de que puede permitírselo (trabajo estable, negocio propio, menciona inversiones)
- "dudoso" → Hay señales de alerta económicas, considerar cualificar antes de la llamada
- "no" → Claramente no puede permitírselo ahora mismo

## FORMATO DE RESPUESTA — JSON EXACTO:
{
  "fase_actual": "FASE X — NOMBRE",
  "numero_fase": X,
  "analisis": "Qué ha pasado y por qué estás en esta fase (2-3 frases máximo)",
  "siguiente_objetivo": "Qué necesitas conseguir con el próximo mensaje (1 frase)",
  "mensaje_sugerido": "El mensaje exacto a enviar, listo para copiar",
  "por_que": "La lógica detrás del mensaje (2-3 frases)",
  "señal_de_avance": "Qué respuesta del lead indica que puedes avanzar (1 frase)",
  "nivel_de_interes": "alto | medio | bajo",
  "cualificacion_problema": "si | parcial | no | sin_datos",
  "cualificacion_economica": "formulario | probable_si | dudoso | no",
  "razon_cualificacion": "Una frase explicando por qué le has dado esa cualificación de problema",
  "alerta": "null o una advertencia si hay algo que vigilar"
}`;

const PHASES = [
  { id: 1, label: "Apertura" },
  { id: 2, label: "Contexto" },
  { id: 3, label: "Dolor" },
  { id: 4, label: "Deseado" },
  { id: 5, label: "Cualif." },
  { id: 6, label: "Pitch" },
  { id: 7, label: "Agenda" },
  { id: 8, label: "Triage" },
];

const INTEREST_COLORS = {
  alto: { bg: "#0f2a0f", border: "#22c55e44", text: "#22c55e", dot: "#22c55e" },
  medio: { bg: "#2a1f0a", border: "#f59e0b44", text: "#f59e0b", dot: "#f59e0b" },
  bajo: { bg: "#2a0f0f", border: "#ef444444", text: "#ef4444", dot: "#ef4444" },
};

export default function CopilotoProVentas() {
  const [conversation, setConversation] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef(null);

  const analyze = async () => {
    if (!conversation.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.REACT_APP_ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system: buildSystemPrompt(CLIENT_CONFIG),
          messages: [{
            role: "user",
            content: `Analiza esta conversación con el lead y responde SOLO con el JSON exacto sin ningún texto adicional:\n\n${conversation}`,
          }],
        }),
      });

      const data = await res.json();
      if (data.error) { setError(`Error: ${data.error.message}`); return; }
      const text = data.content?.find((b) => b.type === "text")?.text || "";
      if (!text) { setError("Sin respuesta. Inténtalo de nuevo."); return; }
      // Try multiple parsing strategies
      let parsed = null;
      try {
        // Strategy 1: direct parse
        parsed = JSON.parse(text.trim());
      } catch {
        try {
          // Strategy 2: extract JSON block
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        } catch {
          // Strategy 3: find first { to last }
          const start = text.indexOf("{");
          const end = text.lastIndexOf("}");
          if (start !== -1 && end !== -1) {
            try { parsed = JSON.parse(text.slice(start, end + 1)); } catch {}
          }
        }
      }
      if (!parsed) { setError("No se pudo leer la respuesta: " + text.slice(0, 100)); return; }
      setResult(parsed);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyMessage = () => {
    if (!result?.mensaje_sugerido) return;
    navigator.clipboard.writeText(result.mensaje_sugerido);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const phaseNum = result?.numero_fase || 0;
  const interest = result?.nivel_de_interes || "medio";
  const interestStyle = INTEREST_COLORS[interest] || INTEREST_COLORS.medio;
  const gold = CLIENT_CONFIG.color_primario;
  const silver = CLIENT_CONFIG.color_primario;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080808",
      color: "#e8e0cc",
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(180deg, #111111 0%, #080808 100%)",
        borderBottom: "1px solid #222222",
        padding: "24px 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "linear-gradient(145deg, #2a2a2a, #111111)", border: "1.5px solid #404040", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 0 16px rgba(200,200,200,0.08), inset 0 1px 0 rgba(255,255,255,0.08)" }}>
            <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <polygon points="50,4 93,27 93,73 50,96 7,73 7,27" fill="none" stroke="#c0c0c0" strokeWidth="5"/>
              <text x="50" y="68" textAnchor="middle" fill="#e0e0e0" fontSize="52" fontWeight="900" fontFamily="'DM Sans', Helvetica, sans-serif" letterSpacing="-4">M</text>
            </svg>
          </div>
          <div style={{ width: "1px", height: "36px", background: "#222222", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: "10px", color: "#555555", letterSpacing: "2.5px", textTransform: "uppercase" }}>
              Sistema Inbound Setteo Norma
            </div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "#e2e2e2", letterSpacing: "1.5px", textTransform: "uppercase", marginTop: "4px" }}>
              Proyecto Makeover
            </div>
          </div>
        </div>
        <div style={{
          fontSize: "12px", color: "#555555",
          padding: "6px 14px",
          border: "1px solid #1e1e1e",
          borderRadius: "20px",
          letterSpacing: "0.5px",
        }}>
          {CLIENT_CONFIG.nombre}
        </div>
      </div>

      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 24px" }}>

        {/* Phase tracker */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{ fontSize: "11px", color: "#555555", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "12px" }}>
            FASES DEL SISTEMA
          </div>
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            {PHASES.map((phase, i) => {
              const isActive = phaseNum === phase.id;
              const isPast = phaseNum > phase.id;
              return (
                <div key={phase.id} style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
                  <div style={{
                    flex: 1,
                    padding: "8px 4px",
                    textAlign: "center",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: isActive ? "700" : "500",
                    background: isActive ? `${silver}18` : isPast ? "#111111" : "transparent",
                    color: isActive ? gold : isPast ? `${gold}66` : "#2a2010",
                    border: `1px solid ${isActive ? silver+"99" : isPast ? silver+"33" : "#1e1e1e"}`,
                    transition: "all 0.3s",
                    letterSpacing: "0.3px",
                  }}>
                    <div style={{ fontSize: "10px", opacity: 0.7, marginBottom: "2px" }}>{phase.id}</div>
                    {phase.label}
                  </div>
                  {i < PHASES.length - 1 && (
                    <div style={{
                      width: "12px", height: "1px",
                      background: isPast ? `${gold}44` : "#1a1408",
                      flexShrink: 0,
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Input */}
        <div style={{
          background: "#0f0f0f",
          border: `1px solid #1e1c14`,
          borderRadius: "12px",
          overflow: "hidden",
          marginBottom: "16px",
        }}>
          <div style={{
            padding: "12px 20px",
            borderBottom: "1px solid #1a1a1a",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#2a2418" }} />
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#2a2418" }} />
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#2a2418" }} />
            <div style={{ fontSize: "11px", color: "#333333", letterSpacing: "1px", textTransform: "uppercase", marginLeft: "8px" }}>
              Conversación con el lead
            </div>
          </div>
          <textarea
            value={conversation}
            onChange={(e) => setConversation(e.target.value)}
            placeholder="Pega aquí la conversación completa tal como aparece en WhatsApp o el CRM..."
            style={{
              width: "100%",
              minHeight: "240px",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#aaaaaa",
              fontSize: "14px",
              lineHeight: "1.8",
              padding: "20px",
              resize: "vertical",
              boxSizing: "border-box",
              fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
            }}
          />
        </div>

        {/* Button */}
        <button
          onClick={analyze}
          disabled={loading || !conversation.trim()}
          style={{
            width: "100%",
            padding: "18px",
            borderRadius: "10px",
            border: "none",
            background: loading || !conversation.trim()
              ? "#1a1810"
              : `linear-gradient(135deg, ${silver} 0%, #aaaaaa 100%)`,
            color: loading || !conversation.trim() ? "#333333" : "#080808",
            fontSize: "14px",
            fontWeight: "700",
            cursor: loading || !conversation.trim() ? "not-allowed" : "pointer",
            letterSpacing: "1px",
            textTransform: "uppercase",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            boxShadow: loading || !conversation.trim() ? "none" : `0 4px 20px ${silver}22`,
          }}
        >
          {loading ? (
            <>
              <span style={{
                display: "inline-block",
                width: "14px", height: "14px",
                border: `2px solid #3a3020`,
                borderTopColor: silver,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }} />
              Analizando conversación...
            </>
          ) : "⚡ Analizar y generar respuesta"}
        </button>

        {error && (
          <div style={{
            marginTop: "16px", padding: "14px 18px",
            background: "#1a0a0a", border: "1px solid #3a1010",
            borderRadius: "8px", color: "#f87171", fontSize: "13px",
          }}>
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div ref={resultRef} style={{ marginTop: "40px" }}>

            {/* Top row */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
              {/* Fase */}
              <div style={{
                padding: "8px 18px", borderRadius: "6px",
                background: `${silver}10`, border: `1px solid ${silver}33`,
                color: silver, fontSize: "13px", fontWeight: "700", letterSpacing: "0.5px",
              }}>
                {result.fase_actual}
              </div>

              {/* Interés */}
              <div style={{
                padding: "8px 18px", borderRadius: "6px",
                background: interestStyle.bg, border: `1px solid ${interestStyle.border}`,
                color: interestStyle.text, fontSize: "12px", fontWeight: "600",
                letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "7px",
              }}>
                <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: interestStyle.dot }} />
                INTERÉS {interest.toUpperCase()}
              </div>

              {/* Cualificación problema */}
              {result.cualificacion_problema && (() => {
                const qMap = {
                  si:        { bg: "#0f2a0f", border: "#22c55e44", color: "#22c55e", icon: "✓", label: "CUALIFICADO" },
                  parcial:   { bg: "#2a1f0a", border: "#f59e0b44", color: "#f59e0b", icon: "◑", label: "PARCIAL" },
                  no:        { bg: "#2a0f0f", border: "#ef444444", color: "#ef4444", icon: "✗", label: "NO CUALIFICADO" },
                  sin_datos: { bg: "#141414", border: "#6b728044", color: "#6b7280", icon: "?", label: "SIN DATOS" },
                };
                const q = qMap[result.cualificacion_problema] || qMap.sin_datos;
                return (
                  <div title={result.razon_cualificacion} style={{
                    padding: "8px 18px", borderRadius: "6px",
                    background: q.bg, border: `1px solid ${q.border}`,
                    color: q.color, fontSize: "12px", fontWeight: "600",
                    letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "7px",
                    cursor: "help",
                  }}>
                    {q.icon} {q.label}
                  </div>
                );
              })()}

              {/* Cualificación económica — solo si no es formulario */}
              {result.cualificacion_economica && result.cualificacion_economica !== "formulario" && (() => {
                const eMap = {
                  probable_si: { bg: "#0f1a2a", border: "#3b82f644", color: "#3b82f6", icon: "💰", label: "PUEDE PAGAR" },
                  dudoso:      { bg: "#2a1a0a", border: "#f5973044", color: "#f59730", icon: "⚠", label: "EC. DUDOSO" },
                  no:          { bg: "#2a0f0f", border: "#ef444444", color: "#ef4444", icon: "✗", label: "SIN PRESUPUESTO" },
                };
                const e = eMap[result.cualificacion_economica];
                if (!e) return null;
                return (
                  <div style={{
                    padding: "8px 18px", borderRadius: "6px",
                    background: e.bg, border: `1px solid ${e.border}`,
                    color: e.color, fontSize: "12px", fontWeight: "600",
                    letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "7px",
                  }}>
                    {e.icon} {e.label}
                  </div>
                );
              })()}

              {/* Alerta */}
              {result.alerta && result.alerta !== "null" && (
                <div style={{
                  padding: "8px 18px", borderRadius: "6px",
                  background: "#1a0f00", border: "1px solid #f5973044",
                  color: "#f59730", fontSize: "12px", fontWeight: "600",
                  letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "7px",
                }}>
                  ⚠ {result.alerta}
                </div>
              )}
            </div>

            {/* Razón cualificación */}
            {result.razon_cualificacion && (
              <div style={{
                marginBottom: "16px", padding: "12px 18px",
                background: "#0f0f0f", border: "1px solid #1e1e1e",
                borderRadius: "8px", fontSize: "12px", color: "#6a5a3a", lineHeight: "1.6",
              }}>
                <span style={{ color: "#555555", fontWeight: "700", letterSpacing: "0.5px", textTransform: "uppercase", fontSize: "10px" }}>
                  📋 Cualificación —{" "}
                </span>
                {result.razon_cualificacion}
              </div>
            )}

            {/* Analysis + Objective row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div style={{
                background: "#0f0f0f", border: "1px solid #1e1e1e",
                borderRadius: "10px", padding: "18px",
              }}>
                <div style={{ fontSize: "10px", color: "#555555", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "10px" }}>
                  🔍 Análisis
                </div>
                <div style={{ fontSize: "13px", color: "#888888", lineHeight: "1.7" }}>
                  {result.analisis}
                </div>
              </div>
              <div style={{
                background: "#0f0f0f", border: "1px solid #1e1e1e",
                borderRadius: "10px", padding: "18px",
              }}>
                <div style={{ fontSize: "10px", color: "#555555", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "10px" }}>
                  🎯 Objetivo
                </div>
                <div style={{ fontSize: "13px", color: "#888888", lineHeight: "1.7" }}>
                  {result.siguiente_objetivo}
                </div>
              </div>
            </div>

            {/* Message — hero card */}
            <div style={{
              background: "linear-gradient(135deg, #111111 0%, #141414 100%)",
              border: `1px solid ${silver}33`,
              borderRadius: "12px",
              overflow: "hidden",
              marginBottom: "12px",
              boxShadow: `0 0 30px ${silver}11`,
            }}>
              <div style={{
                padding: "14px 20px",
                borderBottom: `1px solid ${silver}1a`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <div style={{ fontSize: "10px", color: gold, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: "Georgia, serif" }}>
                  💬 Mensaje a enviar
                </div>
                <button
                  onClick={copyMessage}
                  style={{
                    padding: "6px 16px", borderRadius: "6px",
                    border: `1px solid ${copied ? "#22c55e44" : `${silver}22`}`,
                    background: copied ? "#0f2a0f" : "#1a1508",
                    color: copied ? "#22c55e" : silver,
                    fontSize: "11px", fontWeight: "700",
                    cursor: "pointer", letterSpacing: "0.5px",
                    textTransform: "uppercase", transition: "all 0.2s",
                  }}
                >
                  {copied ? "✓ Copiado" : "Copiar"}
                </button>
              </div>
              <div style={{
                padding: "24px",
                fontSize: "15px", color: "#e0e0e0",
                lineHeight: "1.9", whiteSpace: "pre-wrap",
                fontFamily: "Georgia, serif",
              }}>
                {result.mensaje_sugerido}
              </div>
            </div>

            {/* Why + Signal row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div style={{
                background: "#0f0f0f", border: "1px solid #1e1e1e",
                borderRadius: "10px", padding: "18px",
              }}>
                <div style={{ fontSize: "10px", color: "#555555", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "10px" }}>
                  🧠 Por qué este mensaje
                </div>
                <div style={{ fontSize: "13px", color: "#888888", lineHeight: "1.7" }}>
                  {result.por_que}
                </div>
              </div>
              <div style={{
                background: "#0f0f0f", border: "1px solid #1e1e1e",
                borderRadius: "10px", padding: "18px",
              }}>
                <div style={{ fontSize: "10px", color: "#444444", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "10px" }}>
                  ✅ Señal de avance
                </div>
                <div style={{ fontSize: "13px", color: "#888888", lineHeight: "1.7" }}>
                  {result.señal_de_avance}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        textarea::placeholder { color: #252525; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0c0b08; }
        ::-webkit-scrollbar-thumb { background: #2a2010; border-radius: 3px; }
      `}</style>
    </div>
  );
}
