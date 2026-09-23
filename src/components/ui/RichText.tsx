/**
 * Texto com negritos leves: os segmentos entre `**` são renderizados como
 * `<strong>`. Evita partir frases longas de atribuição/ajuda em dezenas de
 * chaves de dicionário (o texto vem inteiro numa só chave por locale).
 */
export default function RichText({
  text,
  strongClassName = 'text-fg',
}: {
  text: string;
  strongClassName?: string;
}) {
  return (
    <>
      {text.split('**').map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className={strongClassName}>
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}
