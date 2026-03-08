# Copiloto de Ventas — Proyecto Makeover

## Pasos para publicarlo en Vercel (5 minutos)

### 1. Sube el proyecto a GitHub
1. Ve a github.com → New repository → nombre: `copiloto-makeover`
2. Sube todos estos archivos (arrastra la carpeta o usa GitHub Desktop)

### 2. Despliega en Vercel
1. Ve a vercel.com → Login con GitHub
2. "Add New Project" → selecciona el repo `copiloto-makeover`
3. En "Environment Variables" añade:
   - **Nombre:** `REACT_APP_ANTHROPIC_API_KEY`
   - **Valor:** tu API key de Anthropic (la encuentras en console.anthropic.com)
4. Click en "Deploy" → en 2 minutos tienes la URL

### 3. Dominio propio (opcional)
En el dashboard de Vercel → Settings → Domains → añade tu dominio

---

## Para correrlo en local
```bash
npm install
cp .env.example .env
# Edita .env y añade tu API key real
npm start
```

## Estructura
```
copiloto-makeover/
├── public/
│   └── index.html
├── src/
│   ├── App.jsx       ← El copiloto completo
│   └── index.js      ← Entrada de React
├── .env.example      ← Plantilla de variables de entorno
└── package.json
```
