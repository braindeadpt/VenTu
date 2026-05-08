# 🤙 WindSpot Social — Report de Viabilidade

## A Ideia
Transformar o windspot-pt numa **rede social** para desportos náuticos, com **chat em tempo real para cada spot** (Guincho Chat, Nazaré Chat, etc.) + perfis de riders + check-ins + fotos/vídeos da sessão.

---

## 📊 Arquitetura Recomendada

### Stack Escolhido: **Supabase + Next.js** (recomendação)

| Componente | Tecnologia | Porquê |
|-----------|-----------|--------|
| **Frontend** | Next.js 14 (existente) | Já está feito, SSR/SSG |
| **Backend Chat** | Supabase Realtime | PostgreSQL nativo, WebSocket integrado, sem servidor extra |
| **Auth** | Supabase Auth | OAuth (Google, GitHub), email, anónimo |
| **DB** | PostgreSQL (Supabase) | Dados estruturados, relacional, SQL puro |
| **Storage** | Supabase Storage | Fotos/vídeos das sessões |
| **Real-time** | Supabase Realtime (LISTEN/NOTIFY) | Canais por spot, sem código extra |

### Porquê NÃO Socket.io ou Firebase?

| | **Supabase** | **Socket.io** | **Firebase** |
|---|---|---|---|
| Código extra | ❌ Quase nenhum | ⚠️ Servidor Node.js separado | ⚠️ SDK pesado |
| Escalabilidade | ✅ Automática | ⚠️ Manual (Redis adapter) | ✅ Automática |
| Custo (início) | **$0** | VPS ~$5/mês | $0-3/mês |
| Custo (escala) | **$25/mês** (previsível) | VPS $20-100/mês | $73-521/mês (imprevisível!) |
| Lock-in | ✅ Open-source | ✅ Open-source | ❌ Google lock-in |
| Complexidade | 🟢 Baixa | 🟡 Média | 🟡 Média |

---

## 💰 Custos de Alojamento (Realistas)

### Fase 1 — MVP (0-5.000 users)
| Serviço | Custo | Inclui |
|--------|-------|--------|
| Supabase Free Tier | **$0/mês** | 500MB DB, 1GB storage, 2GB egress, 2M edge functions |
| Vercel (Next.js) | **$0/mês** | Hobby plan ilimitado para static sites |
| **TOTAL** | **$0/mês** | ✅ Grátis completamente |

### Fase 2 — Crescimento (5.000-50.000 users)
| Serviço | Custo | Inclui |
|--------|-------|--------|
| Supabase Pro | **$25/mês** | 8GB DB, 100GB storage, 200GB bandwidth, 2M functions |
| Vercel Pro | **$20/mês** | Serverless functions, analytics |
| **TOTAL** | **$45/mês** | ~40€/mês |

### Fase 3 — Escala (50.000-200.000 users)
| Serviço | Custo | Inclui |
|--------|-------|--------|
| Supabase Team | **$599/mês** | 64GB DB, 500GB storage, 1TB bandwidth |
| Vercel Enterprise | **$150/mês** | Advanced analytics, support |
| **TOTAL** | **~$750/mês** | ~700€/mês |

⚠️ **Firebase (alternativa) teria surpresas:** um developer teve uma conta de **$1.800 num mês** porque foi featured no Product Hunt e bots fizeram leituras massivas no Firestore. Com Supabase isso não acontece — API calls são ilimitadas.

---

## 📦 Pesos em Termos de Código

### Quanto código novo é preciso?

| Feature | Ficheiros novos | Linhas de código | Complexidade |
|---------|----------------|------------------|-------------|
| **Chat por spot (real-time)** | 2-3 componentes | ~300 linhas | 🟢 Fácil |
| **Auth (login/registo)** | 1-2 componentes | ~200 linhas | 🟢 Fácil |
| **Perfil de rider** | 2-3 componentes | ~400 linhas | 🟡 Média |
| **Check-in no spot** | 1 componente | ~100 linhas | 🟢 Fácil |
| **Upload fotos/vídeos** | 1-2 componentes | ~200 linhas | 🟡 Média |
| **Feed de atividade** | 1-2 componentes | ~250 linhas | 🟡 Média |
| **Notificações** | 1 componente | ~150 linhas | 🟡 Média |
| **Moderação (report/delete)** | 1-2 componentes | ~200 linhas | 🟡 Média |
| **TOTAL** | **~12-15 ficheiros** | **~1.800 linhas** | **🟡 Média** |

### Comparação: Código adicionado ao projeto atual
- Projeto atual: ~3.500 linhas
- Com rede social: ~5.300 linhas
- **Aumento: ~50%** — significativo mas não brutal

---

## ⏱️ Tempo de Implementação

| Fase | Features | Tempo estimado |
|------|---------|----------------|
| **Fase A — Chat MVP** | Chat por spot em tempo real, auth básico | **1-2 semanas** |
| **Fase B — Social** | Perfis, check-ins, feed de atividade | **2-3 semanas** |
| **Fase C — Media** | Upload fotos/vídeos, galeria por spot | **1-2 semanas** |
| **Fase D — Polish** | Notificações, moderação, UX final | **1-2 semana** |
| **TOTAL** | **Rede social completa** | **5-9 semanas** (1 dev a tempo parcial) |

---

## 🏗️ Como Implementar (Arquitetura Técnica)

### 1. Database Schema (PostgreSQL)

```sql
-- Users (extend existing or new table)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  location TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Chat messages per spot
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  spot_slug TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  reply_to UUID REFERENCES messages(id)
);

-- Check-ins ("estou no spot!")
CREATE TABLE checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  spot_slug TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id),
  conditions TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Media uploads
CREATE TABLE media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  spot_slug TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id),
  url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Real-time Chat (Supabase)

```typescript
// Client-side (React component)
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export function SpotChat({ spotSlug, userId }: { spotSlug: string; userId: string }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    // Subscribe to real-time messages for this spot
    const channel = supabase
      .channel(`spot-${spotSlug}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `spot_slug=eq.${spotSlug}`
      }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [spotSlug]);

  const sendMessage = async (content: string) => {
    await supabase.from('messages').insert({
      spot_slug: spotSlug,
      user_id: userId,
      content,
    });
  };

  return (
    <div className="chat-container">
      {messages.map(msg => (
        <div key={msg.id} className="message">{msg.content}</div>
      ))}
      <input onSubmit={(e) => sendMessage(e.target.value)} />
    </div>
  );
}
```

**Código:** ~80 linhas para chat real-time funcional!

### 3. Escalabilidade (quando crescer)

- **1-1.000 users:** Supabase Free + Vercel Free ✅
- **1.000-10.000 users:** Supabase Pro ($25) ✅
- **10.000+ users:** Adicionar Redis para cache + CDN para imagens

---

## ⚖️ Prós vs Contras

### ✅ Prós
| Argumento | Detalhe |
|-----------|---------|
| **Engajamento brutal** | Chat por spot = comunidade local forte |
| **Dados em tempo real** | "Ondas estão a bater!" — informação instantânea |
| **Conteúdo gerado por users** | Fotos, vídeos, check-ins = site sempre fresco |
| **Network effect** | Mais users = mais valor = mais users |
| **Monetização futura** | Premium features (previsões avançadas, spots secretos) |
| **Custo inicial $0** | Podes lançar sem gastar nada |

### ⚠️ Contras
| Argumento | Detalhe |
|-----------|---------|
| **Moderação** | Chat aberto precisa de moderação (spam, trolls) |
| **Privacidade** | Spots secretos não podem ter chat público (expor localização) |
| **Complexidade** | Auth, DB real-time, storage = +50% código |
| **Manutenção** | Comunidade ativa precisa de gestão |
| **Legal** | RGPD/GDPR — dados pessoais dos users |

---

## 🎯 Recomendação Final

### É viável? **SIM!** ✅

Mas recomendo **fasear**:

### 🚀 Fase 1 — "Chat MVP" (1-2 semanas)
- Chat anónimo (sem registo) por spot
- Sem histórico (mensagens desaparecem em 24h)
- Sem fotos — só texto
- **Objetivo:** testar se a comunidade usa

### 📈 Fase 2 — "Social Lite" (+2 semanas)
- Auth simples (Google/GitHub)
- Perfis básicos
- Check-ins
- **Objetivo:** engajamento recorrente

### 🏆 Fase 3 — "Full Social" (+3-4 semanas)
- Fotos/vídeos
- Feed global
- Notificações
- Moderação
- **Objetivo:** rede social completa

### 🔒 Spots Secretos — TRATAMENTO ESPECIAL
- **NÃO ter chat público** — expõe localização
- **Chat privado** só para membros verificados
- **Ou nenhum chat** — mantém segredo

---

## 📋 Checklist de Decisão

| Pergunta | Resposta |
|----------|----------|
| É tecnicamente viável? | **SIM** — Supabase Realtime resolve 80% |
| É caro? | **NÃO** — começa a $0, escala a ~40€/mês |
| É muito código? | **MÉDIO** — ~1.800 linhas novas |
| Demora muito? | **5-9 semanas** (1 dev) |
| Vale a pena? | **SIM** — diferenciador brutal vs Beachcam |

---

> **Conclusão:** A ideia é **irreverente, viável e valiosa**. O chat por spot transforma o windspot-pt de "site de informação" para "comunidade". Com Supabase, o custo técnico é baixo e o potencial de engajamento é enorme. **Recomendo começar pelo MVP de chat anónimo** para validar interesse antes de investir em auth/perfil completo. 🫡💪
