'use client';

/**
 * Linha «detalhes» da v6 (números técnicos em letra pequena), fechada por
 * omissão. Botão com aria-expanded + região `hidden`, e não um <details>:
 * vive DENTRO do <details id="estudo">, e um segundo <summary> lá dentro
 * baralhava quem procura o cabeçalho do «Estudar o spot» (`#estudo summary`).
 */
import { useId, useState, type ReactNode } from 'react';

export default function DetalhesV6({ rotulo, children, ...data }: { rotulo: string; children: ReactNode } & Record<`data-${string}`, string>) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  return (
    <div className="ec-det" data-aberto={aberto ? 'true' : 'false'} {...data}>
      <button type="button" className="ec-det-b" aria-expanded={aberto} aria-controls={id} onClick={() => setAberto((x) => !x)}>
        {rotulo}
      </button>
      <div id={id} className="ec-det-c" hidden={!aberto}>
        {children}
      </div>
    </div>
  );
}
