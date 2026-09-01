# Publicar o VenTu no Zenodo (DOI próprio)

O VenTu ainda **não tem DOI próprio** — o `CITATION.cff` só cita a Open-Meteo
(`preferred-citation`). Este guia é o caminho completo para cunhar o DOI do
projecto via integração GitHub↔Zenodo e passá-lo para o `CITATION.cff`.

> **O que já está preparado no repo** (não precisas de mexer):
> - `.zenodo.json` — metadados que o hook do Zenodo usa no arquivo (título,
>   descrição, autor, licença MIT, keywords, `upload_type: software`,
>   `access_right: open` e o DOI da Open-Meteo como `related_identifiers.cites`
>   para a atribuição CC-BY constar do registo).
> - `CITATION.cff` — já com `preferred-citation` (Open-Meteo); falta só o
>   **campo de nível superior `doi:`** com o DOI do VenTu (passo 6).
> - `scripts/check-citation-cff.js` (CI) — valida o `doi` do topo quando
>   presente; não falha enquanto não existir.

---

## Passos (uma vez, ~15 min)

### 1. Conta Zenodo
1. Abre <https://zenodo.org> e entra com **«Log in with GitHub»** (usa a mesma
   conta `braindeadpt` — o GitHub dá-te acesso directo, sem password nova).
2. Confirma o e-mail se o Zenodo o pedir.

### 2. Ligar o repo ao Zenodo
1. Em Zenodo, vai a **«GitHub»** no menu (ou
   <https://zenodo.org/account/settings/github/>).
2. Clica **«Sync now»** para o Zenodo ver os teus repos.
3. Na lista, encontra **`braindeadpt/VenTu`** e liga o toggle **«On»** ao lado.
   - O Zenodo passa a receber um webhook sempre que criares uma **GitHub Release**.

### 3. Criar a primeira GitHub Release (isto dispara o arquivo)
1. No GitHub, vai a **Releases → Draft a new release** (ou cria a tag via
   `git tag v1.0.0 && git push origin v1.0.0`).
2. Tag: **`v1.0.0`** (alinha com o `version: "1.0.0"` do CITATION.cff).
3. Título/notas: descreve o que é o VenTu (podes reutilizar o abstract do
   CITATION.cff) — é isto que aparece no registo do Zenodo.
4. Publica o release.

### 4. Obter o DOI
1. O Zenodo arquiva automaticamente (minutos). O estado aparece em
   <https://zenodo.org/account/settings/github/> → VenTu.
2. Abre o registo publicado e copia o **DOI da versão** (ex.
   `10.5281/zenodo.1234567`). O Zenodo dá-te também um **DOI de conceito**
   (ex. `10.5281/zenodo.1234566`) que aponta sempre para a última versão —
   para citar o projecto em geral, usa o de conceito.

### 5. Rever o registo no Zenodo
- Confere título, autor, licença MIT, keywords e a descrição.
- Confirma que o DOI da Open-Meteo aparece nos **Related identifiers** como
  «cites» (garante a atribuição CC-BY dentro do próprio registo).
- Podes editar o registo depois — o DOI já cunhado **não muda**.

### 6. Passar o DOI para o `CITATION.cff`
Depois do DOI existir, adiciona o campo **de nível superior** `doi:` ao
`CITATION.cff` (junto do `url`/`repository-code`). O `preferred-citation` fica
**intocado** — é a citação da Open-Meteo:

```yaml
url: "https://github.com/braindeadpt/VenTu"
repository-code: "https://github.com/braindeadpt/VenTu"
doi: "10.5281/zenodo.1234567"   # ← DOI do VenTu (versão ou conceito)
```

Depois:
1. `node scripts/check-citation-cff.js` — o guard passa a validar o formato
   deste DOI.
2. `npx vitest run scripts/lib/__tests__/checkCitationCff.test.js` — suite OK.
3. Actualiza o **About** (a nota da citação oficial pode passar a ligar o DOI
   do VenTu e o do CITATION.cff, lado a lado com o da Open-Meteo).
4. Commit.

---

## Checklist pós-publicação
- [ ] `.zenodo.json` no repo (já está) e válido (`node -e "JSON.parse(require('fs').readFileSync('.zenodo.json','utf8'))"`).
- [ ] Primeira GitHub Release criada e arquivada no Zenodo.
- [ ] DOI (conceito) no campo de topo `doi:` do `CITATION.cff`.
- [ ] Guard `check-citation-cff.js` verde com o DOI novo.
- [ ] About actualizado com o DOI do VenTu.
- [ ] Registo Zenodo revisto (autor real/ORCID se quiseres — o `name` atual é o username GitHub).

## Notas
- **Releases futuras**: cada nova GitHub Release gera uma **nova versão** do
  registo com DOI de versão próprio; o **DOI de conceito** nunca muda — é o
  que deves citar.
- **`.zenodo.json` vs `CITATION.cff`**: o hook do Zenodo lê o `.zenodo.json`
  como fonte de metadados; o `CITATION.cff` é para o GitHub e para quem clona.
  Mantê-los alinhados (título/autores/licença) evita registos divergentes.
- **Nada disto requer tokens no repo** — a ligação é feita na tua sessão
  Zenodo, nunca por secret/action.
