# Contrato visual — #184 Página rápida do spot

Referências: `184-spot-390.png`, `184-spot-1440.png`, `184-spot-scroll-390.png`, `184-spot-scroll-1440.png` (+ `-rm`).

## Ordem (390)
1. Topbar: VenTu · ← Início · nome · ☆.
2. Breadcrumbs «Portugal › Região › Spot».
3. h1 com o nome (tipografia fluida; nunca transborda — ver #198), linha de meta (região · nível · tipo de onda), chips (Bandeira Azul, Praia vigiada, Água).
4. Cartão veredicto: palavra do tier gigante (≥ 64 px), «Melhor janela: Amanhã 08h–12h · média», score + badge de confiança, chips (onda, período, vento + orientação), «Agora: … · atualizado HH:MM», botão «Ir para a melhor janela →».
5. Mini-mapa da praia (pré-visualização do #186) com «Toque para estudar o spot ⤢».
6. Régua horária fixa em baixo (178 px + safe area), partilhada com o «Estudar».
- 1440: veredicto e mini-mapa lado a lado; régua no fundo do contentor.

## Critérios específicos
- O score, a direcção (side-on/offshore…) e a hora do cartão, dos chips, do mini-mapa e da régua são os mesmos números (critério comum 8).
- Mini-mapa: SVG sem atributos NaN (zero erros «attribute … Expected length»).
- Mudar a hora na régua actualiza veredicto, chips e mini-mapa em ≤ 100 ms.
- Aviso de segurança kite (side-offshore/offshore) em --danger, por cima do veredicto, quando aplicável.
